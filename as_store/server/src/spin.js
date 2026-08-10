// Daily Spin — the mobile app's prize wheel, and the vouchers it hands out.
//
// The one rule that matters: **the server draws the prize.** The app receives a
// prize id and animates the wheel to land on it, exactly like the marketing
// site's lucky draw. Nothing about the outcome is decided on the device, so the
// animation can never disagree with what was actually won (or be tampered with).
//
// The cooldown is the `spin_spins` log, not a client timer: the next spin is
// allowed `cooldown_hours` after the customer's most recent row. Signing out,
// reinstalling or changing the device clock buys nothing.
//
// Winning mints a row in `vouchers`, bound to that one account and single-use.
// `redeemVoucher`/`releaseVoucher` below are what checkout calls — they live
// here so the money rules for a voucher exist in exactly one place.

import express from 'express'
import crypto from 'node:crypto'
import { query, withTransaction } from './db.js'
import { requireAuth } from './auth.js'
import { requireCustomer, optionalCustomer } from './customerAuth.js'
// One-way edge: loyalty.js knows nothing about the spin, so importing it here
// cannot create a cycle. Voiding a reward that was bought with points has to
// hand those points back, and the admin voucher routes live in this file.
import { refundVoucherPoints } from './loyalty.js'

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export const spinRouter = express.Router()
const r = spinRouter

// A namespace for the per-customer advisory lock, so two taps on Spin can never
// both pass the cooldown check.
const SPIN_LOCK_NS = 918273

export const PRIZE_TYPES = ['percent', 'amount', 'free_delivery', 'gift', 'none']
// The types that mint a voucher — 'none' is a "try again" slice.
const REWARD_TYPES = new Set(['percent', 'amount', 'free_delivery', 'gift'])
// The types checkout can actually apply. A gift is handed over by staff.
const REDEEMABLE_TYPES = new Set(['percent', 'amount', 'free_delivery'])
const VOUCHER_STATUSES = ['active', 'used', 'fulfilled', 'cancelled']

const money = (v) => Math.round((Number(v) || 0) * 100) / 100
const clampInt = (v, lo, hi, fallback = null) =>
  Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : fallback
const clampNum = (v, lo, hi, fallback = null) =>
  Number.isFinite(Number(v)) ? money(Math.min(hi, Math.max(lo, Number(v)))) : fallback
const oneOf = (v, list) => (list.includes(v) ? v : null)
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null)

// ---------------------------------------------------------------------------
// JSON mappers
// ---------------------------------------------------------------------------

const settingsJson = (r) => ({
  enabled: Boolean(r.enabled),
  title: r.title || 'Daily Spin',
  subtitle: r.subtitle || '',
  intro: r.intro || '',
  image: r.image_url || '',
  winMessage: r.win_message || 'Congratulations!',
  loseMessage: r.lose_message || '',
  terms: Array.isArray(r.terms) ? r.terms : [],
  cooldownHours: Number(r.cooldown_hours ?? 24),
  voucherDays: Number(r.voucher_days ?? 30),
  updatedAt: r.updated_at,
})

// What the app is allowed to know about a slice: how it looks and what it is
// worth. Weight and stock stay server-side — they are the odds.
const sliceJson = (r) => ({
  id: r.id,
  label: r.label || '',
  description: r.description || '',
  type: r.type || 'none',
  value: Number(r.value ?? 0),
  minOrder: Number(r.min_order ?? 0),
  maxDiscount: Number(r.max_discount ?? 0),
  color: r.color || '#A41E22',
})

// The admin's view adds the levers and the resulting odds.
const prizeJson = (r, totalWeight = 0) => ({
  ...sliceJson(r),
  validDays: Number(r.valid_days ?? 0),
  weight: Number(r.weight ?? 0),
  stock: Number(r.stock ?? -1),
  awarded: Number(r.awarded ?? 0),
  sort: Number(r.sort ?? 0),
  visible: Boolean(r.visible),
  // Share of the draw, given the currently drawable set. 0 when it cannot be won.
  chance: totalWeight > 0 && isDrawable(r) ? Number(r.weight ?? 0) / totalWeight : 0,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

// A voucher's stored status plus the one thing that is derived, not written:
// expiry. Nothing sweeps the table, so "expired" is always computed at read time.
export const voucherStatus = (r) => {
  if (r.status !== 'active') return r.status
  if (r.expires_at && new Date(r.expires_at).getTime() <= Date.now()) return 'expired'
  return 'active'
}

const voucherJson = (r) => {
  const status = voucherStatus(r)
  return {
    id: r.id,
    code: r.code,
    customerId: r.customer_id,
    source: r.source || 'spin',
    type: r.type,
    value: Number(r.value ?? 0),
    minOrder: Number(r.min_order ?? 0),
    maxDiscount: Number(r.max_discount ?? 0),
    label: r.label || '',
    description: r.description || '',
    // Non-zero only on a reward bought with AS Points — and the amount that
    // goes back to the customer if staff void it.
    pointsSpent: Number(r.points_spent ?? 0),
    status,
    // Can checkout apply it right now, ignoring the cart? (A gift never can.)
    redeemable: status === 'active' && REDEEMABLE_TYPES.has(r.type),
    orderId: r.order_id,
    adminNote: r.admin_note || '',
    expiresAt: r.expires_at,
    usedAt: r.used_at,
    createdAt: r.created_at,
    // present on admin queries
    customerName: r.customer_name,
    customerMobile: r.customer_mobile,
  }
}

// ---------------------------------------------------------------------------
// The draw
// ---------------------------------------------------------------------------

// A slice is drawable when it is shown, has odds, and has stock left.
const isDrawable = (p) =>
  Boolean(p.visible) && Number(p.weight ?? 0) > 0 && Number(p.stock ?? -1) !== 0

// Unbiased weighted pick. crypto.randomInt() is rejection-sampled by Node, so
// unlike `random() * total` there is no modulo skew to reason about.
function pickWeighted(prizes) {
  const total = prizes.reduce((n, p) => n + Number(p.weight || 0), 0)
  if (total <= 0) return null
  let roll = crypto.randomInt(0, total)
  for (const p of prizes) {
    roll -= Number(p.weight || 0)
    if (roll < 0) return p
  }
  return prizes[prizes.length - 1]
}

// Unambiguous alphabet — no O/0, I/1 — because these get read aloud and retyped.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const randomCode = (prefix) =>
  `${prefix}-${Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)]).join('')}`

const loadSettings = async (db = { query }) => {
  await db.query(`INSERT INTO spin_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`)
  const { rows } = await db.query(`SELECT * FROM spin_settings WHERE id = 1`)
  return rows[0]
}

// When may this customer spin again? null = right now.
async function nextSpinAt(customerId, cooldownHours, db = { query }) {
  const { rows } = await db.query(
    `SELECT created_at FROM spin_spins WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [customerId],
  )
  if (!rows[0]) return null
  const next = new Date(rows[0].created_at).getTime() + Math.max(0, cooldownHours) * 3600_000
  return next > Date.now() ? new Date(next).toISOString() : null
}

// ---------------------------------------------------------------------------
// Customer API
// ---------------------------------------------------------------------------

// The wheel as the app should draw it, plus this customer's cooldown. Public so
// a signed-out visitor still sees the real prizes behind the sign-in prompt —
// that is the whole reason the feature drives sign-ups.
r.get(
  '/api/spin',
  optionalCustomer,
  ah(async (req, res) => {
    const settings = await loadSettings()
    const { rows: prizes } = await query(`SELECT * FROM spin_prizes ORDER BY sort, id`)
    const slices = prizes.filter(isDrawable)
    const config = settingsJson(settings)
    const ready = config.enabled && slices.length >= 2

    const next = req.customerId ? await nextSpinAt(req.customerId, config.cooldownHours) : null
    res.json({
      ...config,
      // Fewer than two slices is not a wheel; treat it as not yet set up rather
      // than shipping a broken screen.
      enabled: ready,
      slices: slices.map(sliceJson),
      signedIn: Boolean(req.customerId),
      nextSpinAt: next,
      canSpin: ready && Boolean(req.customerId) && !next,
    })
  }),
)

// Spin. Everything that decides the outcome happens here, inside one
// transaction holding a per-customer lock.
r.post(
  '/api/spin',
  requireCustomer,
  ah(async (req, res) => {
    const result = await withTransaction(async (client) => {
      // Serialize this customer's spins; a double tap waits here and then fails
      // the cooldown check below rather than winning twice.
      await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [SPIN_LOCK_NS, req.customerId])

      const settings = await loadSettings(client)
      const config = settingsJson(settings)
      if (!config.enabled) return { error: 'The daily spin is not running right now', code: 403 }

      const next = await nextSpinAt(req.customerId, config.cooldownHours, client)
      if (next) return { error: 'You have already used your spin', code: 429, nextSpinAt: next }

      const { rows: all } = await client.query(`SELECT * FROM spin_prizes ORDER BY sort, id`)
      let pool = all.filter(isDrawable)
      if (pool.length < 2) return { error: 'The wheel is not ready yet', code: 503 }
      const sliceIds = pool.map((p) => p.id)

      // Draw, then claim the stock. The conditional UPDATE is the real gate: a
      // concurrent spin for the same last-one-left prize blocks on the row lock
      // and then finds stock = 0, so we drop that slice and draw again.
      let prize = null
      while (pool.length) {
        const candidate = pickWeighted(pool)
        if (!candidate) break
        const { rows: claimed } = await client.query(
          `UPDATE spin_prizes
              SET stock = CASE WHEN stock > 0 THEN stock - 1 ELSE stock END,
                  awarded = awarded + 1
            WHERE id = $1 AND (stock < 0 OR stock > 0)
            RETURNING *`,
          [candidate.id],
        )
        if (claimed[0]) {
          prize = claimed[0]
          break
        }
        pool = pool.filter((p) => p.id !== candidate.id)
      }
      if (!prize) return { error: 'Every prize has been claimed — check back soon', code: 503 }

      const { rows: spinRows } = await client.query(
        `INSERT INTO spin_spins (customer_id, prize_id, prize_label, prize_type)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.customerId, prize.id, prize.label || '', prize.type || 'none'],
      )
      const spin = spinRows[0]

      let voucher = null
      if (REWARD_TYPES.has(prize.type)) {
        const days = Number(prize.valid_days) > 0 ? Number(prize.valid_days) : config.voucherDays
        // Retry on the (vanishingly unlikely) code collision rather than 500.
        for (let attempt = 0; attempt < 5 && !voucher; attempt++) {
          try {
            const { rows } = await client.query(
              `INSERT INTO vouchers
                 (code, customer_id, source, spin_id, prize_id, type, value, min_order,
                  max_discount, label, description, expires_at)
               VALUES ($1,$2,'spin',$3,$4,$5,$6,$7,$8,$9,$10,
                       CASE WHEN $11::int > 0 THEN now() + make_interval(days => $11::int) ELSE NULL END)
               RETURNING *`,
              [
                randomCode('SPIN'),
                req.customerId,
                spin.id,
                prize.id,
                prize.type,
                money(prize.value),
                money(prize.min_order),
                money(prize.max_discount),
                prize.label || '',
                prize.description || '',
                days,
              ],
            )
            voucher = rows[0]
          } catch (e) {
            if (e.code !== '23505') throw e // not a unique violation — real error
          }
        }
        if (!voucher) throw new Error('Could not issue the voucher code')
      }

      const cooldownNext = new Date(Date.now() + config.cooldownHours * 3600_000).toISOString()
      return {
        prizeId: prize.id,
        // The wheel order this draw was made against. The app re-syncs its
        // slices to this before animating, so the pointer always lands right.
        sliceIds,
        prize: sliceJson(prize),
        won: REWARD_TYPES.has(prize.type),
        message: REWARD_TYPES.has(prize.type) ? config.winMessage : config.loseMessage,
        voucher: voucher ? voucherJson(voucher) : null,
        nextSpinAt: cooldownNext,
      }
    })

    if (result.error) {
      const { error, code, ...rest } = result
      return res.status(code).json({ error, ...rest })
    }
    res.json(result)
  }),
)

// This customer's rewards. Pass ?subtotal= from the cart and each voucher comes
// back with whether it applies and what it is worth right now, so checkout never
// has to re-implement the rules.
r.get(
  '/api/vouchers',
  requireCustomer,
  ah(async (req, res) => {
    const { rows } = await query(
      `SELECT * FROM vouchers WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.customerId],
    )
    const subtotal = Number(req.query.subtotal)
    const withCart = Number.isFinite(subtotal) && subtotal > 0
    const { rows: setRows } = await query(
      `SELECT delivery_fee, free_delivery_over FROM settings WHERE id = 1`,
    )
    const deliveryFee = withCart ? deliveryFeeFor(subtotal, setRows[0]) : 0

    res.json(
      rows.map((v) => {
        const json = voucherJson(v)
        if (!withCart) return json
        const check = checkVoucher(v, subtotal, deliveryFee)
        return { ...json, eligible: check.ok, reason: check.reason || '', discount: check.discount }
      }),
    )
  }),
)

// ---------------------------------------------------------------------------
// Redemption — the money rules, used by checkout
// ---------------------------------------------------------------------------

// Kept in sync with deliveryFeeFor() in app.js. Imported here rather than the
// other way round would be circular, so this is a deliberate small duplicate.
const deliveryFeeFor = (subtotal, settings) => {
  const fee = Number(settings?.delivery_fee ?? 0)
  const freeOver = Number(settings?.free_delivery_over ?? 0)
  if (!Number.isFinite(fee) || fee <= 0) return 0
  if (freeOver > 0 && Number(subtotal) >= freeOver) return 0
  return money(fee)
}

// What a voucher takes off a cart. Pure — no DB, no side effects — so the same
// numbers back the checkout preview, the order, and the admin.
export function voucherDiscount(v, subtotal, deliveryFee) {
  const type = v.type
  if (type === 'free_delivery') return { items: 0, delivery: money(deliveryFee) }
  if (type === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(v.value ?? v.percent ?? 0)))
    let off = money((Number(subtotal) || 0) * (pct / 100))
    const cap = Number(v.max_discount ?? v.maxDiscount ?? 0)
    if (cap > 0) off = Math.min(off, money(cap))
    return { items: Math.min(off, money(subtotal)), delivery: 0 }
  }
  if (type === 'amount') {
    return { items: Math.min(money(v.value ?? 0), money(subtotal)), delivery: 0 }
  }
  return { items: 0, delivery: 0 } // gift / none: nothing to take off
}

// Is this voucher usable on this cart? Returns a customer-facing reason when not.
export function checkVoucher(v, subtotal, deliveryFee) {
  const status = voucherStatus(v)
  const fail = (reason) => ({ ok: false, reason, discount: 0 })
  if (status === 'used') return fail('Already used')
  if (status === 'expired') return fail('Expired')
  if (status === 'cancelled') return fail('No longer valid')
  if (status === 'fulfilled') return fail('Already claimed')
  if (v.type === 'gift') return fail('Our team will contact you about this prize')
  if (!REDEEMABLE_TYPES.has(v.type)) return fail('Not valid at checkout')
  const min = Number(v.min_order ?? v.minOrder ?? 0)
  if (min > 0 && Number(subtotal) < min)
    return fail(`Spend $${min.toLocaleString()} or more to use this`)
  const d = voucherDiscount(v, subtotal, deliveryFee)
  const total = money(d.items + d.delivery)
  if (total <= 0) {
    return v.type === 'free_delivery'
      ? fail('Delivery is already free on this order')
      : fail('Nothing to discount')
  }
  return { ok: true, reason: '', discount: total, items: d.items, delivery: d.delivery }
}

export class VoucherError extends Error {}

// Claim a voucher for an order that is about to be created. Marking it used
// *before* the order exists is deliberate: the atomic status flip is what stops
// the same code being spent twice from two devices. `releaseVoucher` puts it
// back if the order then fails to be created.
export async function redeemVoucher({ code, customerId, subtotal, deliveryFee }) {
  const clean = String(code || '').trim().toUpperCase()
  if (!clean) return null
  const { rows } = await query(
    `SELECT * FROM vouchers WHERE upper(code) = $1 AND customer_id = $2`,
    [clean, customerId],
  )
  const v = rows[0]
  if (!v) throw new VoucherError('That reward is not on your account')

  const check = checkVoucher(v, subtotal, deliveryFee)
  if (!check.ok) throw new VoucherError(check.reason)

  const { rows: claimed } = await query(
    `UPDATE vouchers SET status = 'used', used_at = now()
      WHERE id = $1 AND status = 'active' RETURNING id`,
    [v.id],
  )
  if (!claimed[0]) throw new VoucherError('That reward has just been used')

  return {
    id: v.id,
    code: v.code,
    type: v.type,
    label: v.label || '',
    itemsDiscount: check.items,
    deliveryWaived: check.delivery,
    discount: check.discount,
  }
}

// Attach a claimed voucher to the order it paid for.
export const attachVoucherToOrder = (voucherId, orderId) =>
  query(`UPDATE vouchers SET order_id = $2 WHERE id = $1`, [voucherId, orderId])

// Give a claimed voucher back — the order was never created, or was cancelled
// before it was paid. Only ever un-uses a voucher that never reached an order.
export const releaseVoucher = (voucherId) =>
  query(
    `UPDATE vouchers SET status = 'active', used_at = NULL, order_id = NULL
      WHERE id = $1 AND status = 'used'`,
    [voucherId],
  )

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

// Settings + every prize (including hidden and sold-out ones) + headline counts.
r.get(
  '/api/admin/spin',
  requireAuth,
  ah(async (_req, res) => {
    const settings = await loadSettings()
    const { rows: prizes } = await query(`SELECT * FROM spin_prizes ORDER BY sort, id`)
    const totalWeight = prizes.filter(isDrawable).reduce((n, p) => n + Number(p.weight || 0), 0)
    const { rows: stats } = await query(
      `SELECT
         (SELECT count(*) FROM spin_spins)                                       AS spins,
         (SELECT count(*) FROM spin_spins WHERE created_at > now() - interval '7 days') AS spins_week,
         (SELECT count(DISTINCT customer_id) FROM spin_spins)                    AS players,
         (SELECT count(*) FROM vouchers WHERE status = 'active')                 AS vouchers_active,
         (SELECT count(*) FROM vouchers WHERE status = 'used')                   AS vouchers_used`,
    )
    res.json({
      settings: settingsJson(settings),
      prizes: prizes.map((p) => prizeJson(p, totalWeight)),
      stats: {
        spins: Number(stats[0].spins),
        spinsWeek: Number(stats[0].spins_week),
        players: Number(stats[0].players),
        vouchersActive: Number(stats[0].vouchers_active),
        vouchersUsed: Number(stats[0].vouchers_used),
      },
    })
  }),
)

r.put(
  '/api/admin/spin',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    await query(`INSERT INTO spin_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`)
    const { rows } = await query(
      `UPDATE spin_settings SET
         enabled        = COALESCE($1, enabled),
         title          = COALESCE($2, title),
         subtitle       = COALESCE($3, subtitle),
         intro          = COALESCE($4, intro),
         image_url      = COALESCE($5, image_url),
         win_message    = COALESCE($6, win_message),
         lose_message   = COALESCE($7, lose_message),
         terms          = COALESCE($8::jsonb, terms),
         cooldown_hours = COALESCE($9, cooldown_hours),
         voucher_days   = COALESCE($10, voucher_days),
         updated_at     = now()
       WHERE id = 1 RETURNING *`,
      [
        typeof b.enabled === 'boolean' ? b.enabled : null,
        str(b.title, 80),
        str(b.subtitle, 160),
        str(b.intro, 1000),
        str(b.image, 500),
        str(b.winMessage, 160),
        str(b.loseMessage, 160),
        Array.isArray(b.terms)
          ? JSON.stringify(b.terms.filter((t) => typeof t === 'string').map((t) => t.slice(0, 300)).slice(0, 12))
          : null,
        clampInt(b.cooldownHours, 1, 720),
        clampInt(b.voucherDays, 0, 365),
      ],
    )
    res.json(settingsJson(rows[0]))
  }),
)

// Everything a prize form may send. Shared by create and update so the two can
// never drift apart on validation.
const prizeFields = (b) => ({
  label: str(b.label, 40),
  description: str(b.description, 300),
  type: oneOf(b.type, PRIZE_TYPES),
  value: clampNum(b.value, 0, 100000),
  minOrder: clampNum(b.minOrder, 0, 100000),
  maxDiscount: clampNum(b.maxDiscount, 0, 100000),
  validDays: clampInt(b.validDays, 0, 365),
  color: /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : null,
  weight: clampInt(b.weight, 0, 10000),
  stock: clampInt(b.stock, -1, 1000000),
  sort: clampInt(b.sort, 0, 9999),
  visible: typeof b.visible === 'boolean' ? b.visible : null,
})

r.post(
  '/api/admin/spin/prizes',
  requireAuth,
  ah(async (req, res) => {
    const f = prizeFields(req.body || {})
    if (!f.label) return res.status(400).json({ error: 'A slice needs a label' })
    const { rows } = await query(
      `INSERT INTO spin_prizes
         (label, description, type, value, min_order, max_discount, valid_days, color, weight, stock, sort, visible)
       VALUES ($1,$2,COALESCE($3,'none'),COALESCE($4,0),COALESCE($5,0),COALESCE($6,0),COALESCE($7,0),
               COALESCE($8,'#A41E22'),COALESCE($9,1),COALESCE($10,-1),COALESCE($11,0),COALESCE($12,true))
       RETURNING *`,
      [
        f.label,
        f.description,
        f.type,
        f.value,
        f.minOrder,
        f.maxDiscount,
        f.validDays,
        f.color,
        f.weight,
        f.stock,
        f.sort,
        f.visible,
      ],
    )
    res.status(201).json(prizeJson(rows[0]))
  }),
)

r.put(
  '/api/admin/spin/prizes/:id',
  requireAuth,
  ah(async (req, res) => {
    const f = prizeFields(req.body || {})
    const { rows } = await query(
      `UPDATE spin_prizes SET
         label        = COALESCE($2, label),
         description  = COALESCE($3, description),
         type         = COALESCE($4, type),
         value        = COALESCE($5, value),
         min_order    = COALESCE($6, min_order),
         max_discount = COALESCE($7, max_discount),
         valid_days   = COALESCE($8, valid_days),
         color        = COALESCE($9, color),
         weight       = COALESCE($10, weight),
         stock        = COALESCE($11, stock),
         sort         = COALESCE($12, sort),
         visible      = COALESCE($13, visible)
       WHERE id = $1 RETURNING *`,
      [
        Number(req.params.id),
        f.label,
        f.description,
        f.type,
        f.value,
        f.minOrder,
        f.maxDiscount,
        f.validDays,
        f.color,
        f.weight,
        f.stock,
        f.sort,
        f.visible,
      ],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(prizeJson(rows[0]))
  }),
)

r.delete(
  '/api/admin/spin/prizes/:id',
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM spin_prizes WHERE id = $1`, [Number(req.params.id)])
    res.status(204).end()
  }),
)

// The spin log — who spun, what they got, and the voucher it minted.
r.get(
  '/api/admin/spin/spins',
  requireAuth,
  ah(async (req, res) => {
    const limit = clampInt(req.query.limit, 1, 500, 100)
    const offset = clampInt(req.query.offset, 0, 1e6, 0)
    const { rows } = await query(
      `SELECT s.*, c.name AS customer_name, c.mobile AS customer_mobile,
              v.code AS voucher_code, v.status AS voucher_status
         FROM spin_spins s
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN vouchers  v ON v.spin_id = s.id
        ORDER BY s.created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    )
    const { rows: count } = await query(`SELECT count(*)::int AS n FROM spin_spins`)
    res.json({
      total: count[0].n,
      spins: rows.map((s) => ({
        id: s.id,
        customerId: s.customer_id,
        customerName: s.customer_name || '',
        customerMobile: s.customer_mobile || '',
        prizeId: s.prize_id,
        prizeLabel: s.prize_label || '',
        prizeType: s.prize_type || 'none',
        voucherCode: s.voucher_code || '',
        voucherStatus: s.voucher_status || '',
        createdAt: s.created_at,
      })),
    })
  }),
)

// Vouchers, filterable by status and by customer name / mobile / code.
r.get(
  '/api/admin/vouchers',
  requireAuth,
  ah(async (req, res) => {
    const limit = clampInt(req.query.limit, 1, 500, 100)
    const offset = clampInt(req.query.offset, 0, 1e6, 0)
    const q = String(req.query.q || '').trim()
    const status = oneOf(String(req.query.status || ''), [...VOUCHER_STATUSES, 'expired'])
    const params = []
    const where = []
    if (q) {
      params.push(`%${q}%`)
      where.push(`(v.code ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.mobile ILIKE $${params.length})`)
    }
    // 'expired' is derived, so it filters on the date rather than the column.
    if (status === 'expired') where.push(`(v.status = 'active' AND v.expires_at IS NOT NULL AND v.expires_at <= now())`)
    else if (status === 'active') where.push(`(v.status = 'active' AND (v.expires_at IS NULL OR v.expires_at > now()))`)
    else if (status) {
      params.push(status)
      where.push(`v.status = $${params.length}`)
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const { rows } = await query(
      `SELECT v.*, c.name AS customer_name, c.mobile AS customer_mobile
         FROM vouchers v LEFT JOIN customers c ON c.id = v.customer_id
         ${clause}
        ORDER BY v.created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    )
    const { rows: count } = await query(
      `SELECT count(*)::int AS n FROM vouchers v LEFT JOIN customers c ON c.id = v.customer_id ${clause}`,
      params,
    )
    res.json({ total: count[0].n, vouchers: rows.map(voucherJson) })
  }),
)

// Hand a reward out directly — an apology, a competition, a walk-in.
r.post(
  '/api/admin/vouchers',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const customerId = Number(b.customerId)
    const type = oneOf(b.type, [...REDEEMABLE_TYPES, 'gift'])
    if (!customerId || !type) {
      return res.status(400).json({ error: 'Pick a customer and a reward type' })
    }
    const { rows: cust } = await query(`SELECT id FROM customers WHERE id = $1`, [customerId])
    if (!cust[0]) return res.status(404).json({ error: 'Customer not found' })
    const days = clampInt(b.validDays, 0, 365, 0)
    let created = null
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      try {
        const { rows } = await query(
          `INSERT INTO vouchers
             (code, customer_id, source, type, value, min_order, max_discount, label, description, admin_note, expires_at)
           VALUES ($1,$2,'admin',$3,$4,$5,$6,$7,$8,$9,
                   CASE WHEN $10::int > 0 THEN now() + make_interval(days => $10::int) ELSE NULL END)
           RETURNING *`,
          [
            randomCode('AS'),
            customerId,
            type,
            clampNum(b.value, 0, 100000, 0),
            clampNum(b.minOrder, 0, 100000, 0),
            clampNum(b.maxDiscount, 0, 100000, 0),
            str(b.label, 40) || '',
            str(b.description, 300) || '',
            str(b.adminNote, 300) || '',
            days,
          ],
        )
        created = rows[0]
      } catch (e) {
        if (e.code !== '23505') throw e
      }
    }
    if (!created) return res.status(500).json({ error: 'Could not issue a code' })
    res.status(201).json(voucherJson(created))
  }),
)

// Reactivate, void, or mark a gift handed over — plus the staff note.
r.put(
  '/api/admin/vouchers/:id',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const status = oneOf(b.status, VOUCHER_STATUSES)
    const { rows } = await query(
      `UPDATE vouchers SET
         status     = COALESCE($2, status),
         admin_note = COALESCE($3, admin_note),
         -- Reactivating clears the consumption, so the customer really can spend it.
         used_at    = CASE WHEN $2 = 'active' THEN NULL ELSE used_at END,
         order_id   = CASE WHEN $2 = 'active' THEN NULL ELSE order_id END,
         expires_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE expires_at END
       WHERE id = $1 RETURNING *`,
      [
        Number(req.params.id),
        status,
        str(b.adminNote, 300),
        'expiresAt' in b,
        'expiresAt' in b && b.expiresAt ? new Date(b.expiresAt).toISOString() : null,
      ],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    // Voiding a reward the customer *bought* with AS Points puts the points
    // back on their account — otherwise cancelling it would quietly take them.
    if (status === 'cancelled' && rows[0].source === 'points') {
      await refundVoucherPoints(rows[0].id).catch((e) =>
        console.error('[points] refund voucher:', e?.message || e),
      )
    }
    res.json(voucherJson(rows[0]))
  }),
)

r.delete(
  '/api/admin/vouchers/:id',
  requireAuth,
  ah(async (req, res) => {
    // Refund before the row goes: loyalty_ledger.voucher_id is ON DELETE SET
    // NULL, so afterwards there is nothing left to work out what was owed.
    await refundVoucherPoints(req.params.id).catch((e) =>
      console.error('[points] refund voucher:', e?.message || e),
    )
    await query(`DELETE FROM vouchers WHERE id = $1`, [Number(req.params.id)])
    res.status(204).end()
  }),
)
