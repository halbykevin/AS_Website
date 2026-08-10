// AS Points — the loyalty programme: earn points on what you spend, trade a
// block of them for money off.
//
// Two rules carry the whole feature, and both are here rather than on a client:
//
//  1. **Points are reconciled from orders, never appended.** `syncOrderPoints()`
//     works out what an order *should* have awarded and writes the difference
//     against what it already awarded. Call it as often as you like, from
//     wherever an order changes — delivered, cancelled, delivered again — and
//     the customer ends up with the right number of points exactly once.
//
//  2. **Redeeming mints a voucher.** It does not invent a second discount path
//     through checkout: the reward it creates is the same `vouchers` row the
//     Daily Spin hands out, so the money rules (min order, single use, released
//     when an order is cancelled) are the ones already proven in spin.js.
//     `source = 'points'` and `points_spent` are what tie it back here.
//
// The balance is always SUM(loyalty_ledger.points) — there is no cached total to
// fall out of step with the history the customer is shown.

import express from 'express'
import crypto from 'node:crypto'
import { query, withTransaction } from './db.js'
import { requireAuth } from './auth.js'
import { requireCustomer, optionalCustomer } from './customerAuth.js'

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export const loyaltyRouter = express.Router()
const r = loyaltyRouter

// Namespaces for the per-customer / per-order advisory locks. Distinct from the
// spin's so a redemption and a spin never block each other.
const REDEEM_LOCK_NS = 918274
const ORDER_LOCK_NS = 918275

// Which order statuses have "earned" their points, per the `award_on` setting.
// Cancelled is absent from all three on purpose: a cancelled order always gives
// its points back.
const QUALIFYING = {
  delivered: ['delivered'],
  confirmed: ['confirmed', 'shipped', 'delivered'],
  created: ['pending', 'confirmed', 'shipped', 'delivered'],
}
const AWARD_ON = Object.keys(QUALIFYING)
const LEDGER_KINDS = ['earn', 'revoke', 'redeem', 'adjust']

const money = (v) => Math.round((Number(v) || 0) * 100) / 100
const clampInt = (v, lo, hi, fallback = null) =>
  Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : fallback
const clampNum = (v, lo, hi, fallback = null) =>
  Number.isFinite(Number(v)) ? money(Math.min(hi, Math.max(lo, Number(v)))) : fallback
const oneOf = (v, list) => (list.includes(v) ? v : null)
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null)

// Unambiguous alphabet — no O/0, I/1 — because these codes get read aloud.
// Deliberately the same shape as the spin's; kept local so the two modules do
// not have to import each other.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const randomCode = (prefix) =>
  `${prefix}-${Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)]).join('')}`

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const settingsJson = (s) => ({
  enabled: Boolean(s.enabled),
  title: s.title || 'AS Points',
  subtitle: s.subtitle || '',
  intro: s.intro || '',
  terms: Array.isArray(s.terms) ? s.terms : [],
  earnRate: Number(s.earn_rate ?? 1),
  redeemBlock: Number(s.redeem_block ?? 1000),
  redeemValue: Number(s.redeem_value ?? 50),
  maxBlocks: Number(s.max_blocks ?? 0),
  minOrder: Number(s.min_order ?? 0),
  voucherDays: Number(s.voucher_days ?? 0),
  awardOn: s.award_on || 'delivered',
  updatedAt: s.updated_at,
})

export async function loadLoyaltySettings(db = { query }) {
  await db.query(`INSERT INTO loyalty_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`)
  const { rows } = await db.query(`SELECT * FROM loyalty_settings WHERE id = 1`)
  return settingsJson(rows[0])
}

// ---------------------------------------------------------------------------
// Earning
// ---------------------------------------------------------------------------

// What an order is worth in points.
//
// The basis is the money that actually bought goods: the items subtotal, less
// any discount that came off those items. Delivery and VAT never earn — they
// aren't spend on our catalogue — and a free-delivery voucher therefore doesn't
// reduce the basis either, which is why the voucher's type is joined in.
// Rounded down, so we never award a point that wasn't paid for.
export const pointsForOrder = (order, settings) => {
  const subtotal = Number(order.subtotal) || 0
  const discount =
    order.voucher_type === 'free_delivery' ? 0 : Number(order.discount_amount) || 0
  const basis = Math.max(0, subtotal - discount)
  return Math.max(0, Math.floor(basis * (Number(settings.earnRate) || 0)))
}

// Bring one order's points in line with what it should have earned.
//
// Idempotent by construction: it reads the earn/revoke rows this order has
// already produced and writes only the difference, so re-running it — after a
// status flip, a re-delivery, a settings change — converges instead of
// duplicating. Returns the delta it wrote (0 when nothing needed to change).
export async function syncOrderPoints(orderId, opts = {}) {
  const id = Number(orderId)
  if (!id) return 0
  const settings = opts.settings || (await loadLoyaltySettings())

  return withTransaction(async (client) => {
    // Serialise per order: two admins flipping the same order at once would
    // otherwise both read "nothing awarded yet" and both award.
    await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [ORDER_LOCK_NS, id])

    const { rows } = await client.query(
      `SELECT o.id, o.customer_id, o.status, o.subtotal, o.discount_amount, v.type AS voucher_type
         FROM orders o LEFT JOIN vouchers v ON v.id = o.voucher_id
        WHERE o.id = $1`,
      [id],
    )
    const order = rows[0]
    // No owner (a deleted account) means nobody to credit.
    if (!order || !order.customer_id) return 0

    const qualifies =
      settings.enabled && QUALIFYING[settings.awardOn]?.includes(order.status)
    const desired = qualifies ? pointsForOrder(order, settings) : 0

    const { rows: already } = await client.query(
      `SELECT COALESCE(SUM(points), 0)::int AS n FROM loyalty_ledger
        WHERE order_id = $1 AND kind IN ('earn','revoke')`,
      [id],
    )
    const delta = desired - Number(already[0].n)
    if (!delta) return 0

    await client.query(
      `INSERT INTO loyalty_ledger (customer_id, points, kind, order_id, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        order.customer_id,
        delta,
        delta > 0 ? 'earn' : 'revoke',
        id,
        delta > 0 ? `Order #${id}` : `Order #${id} ${order.status}`,
      ],
    )
    return delta
  })
}

// Fire-and-forget wrapper for the call sites that must never fail an order
// because the points ledger had a bad day.
export const syncOrderPointsSafe = (orderId) =>
  syncOrderPoints(orderId).catch((e) =>
    console.error(`[points] sync order #${orderId}:`, e?.message || e),
  )

// ---------------------------------------------------------------------------
// Balance + history
// ---------------------------------------------------------------------------

export async function pointsBalance(customerId, db = { query }) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(points), 0)::int AS n FROM loyalty_ledger WHERE customer_id = $1`,
    [customerId],
  )
  return Number(rows[0].n)
}

// Points sitting on orders that haven't qualified yet — "on the way". Shown so
// a customer who just ordered can see the points coming rather than assuming
// the programme is broken.
async function pendingPoints(customerId, settings) {
  if (!settings.enabled) return 0
  const qualifying = QUALIFYING[settings.awardOn] || QUALIFYING.delivered
  const { rows } = await query(
    `SELECT o.id, o.subtotal, o.discount_amount, v.type AS voucher_type
       FROM orders o LEFT JOIN vouchers v ON v.id = o.voucher_id
      WHERE o.customer_id = $1
        AND o.status <> 'cancelled'
        AND NOT (o.status = ANY($2::text[]))`,
    [customerId, qualifying],
  )
  return rows.reduce((n, o) => n + pointsForOrder(o, settings), 0)
}

const entryJson = (e) => ({
  id: Number(e.id),
  points: Number(e.points),
  kind: e.kind,
  orderId: e.order_id,
  voucherId: e.voucher_id,
  voucherCode: e.voucher_code || '',
  description: e.description || '',
  createdAt: e.created_at,
})

// How many blocks this balance can buy, respecting the per-redemption cap.
const blocksAvailable = (balance, settings) => {
  const block = Math.max(1, Number(settings.redeemBlock) || 1)
  const max = Number(settings.maxBlocks) || 0
  const n = Math.floor(balance / block)
  return max > 0 ? Math.min(n, max) : n
}

// ---------------------------------------------------------------------------
// Customer API
// ---------------------------------------------------------------------------

// The programme, plus this customer's standing in it. Signed in gives the
// balance and history; signed out still returns the rules so the page can
// explain the deal behind a sign-in prompt.
r.get(
  '/api/loyalty',
  optionalCustomer,
  ah(async (req, res) => {
    const settings = await loadLoyaltySettings()
    if (!req.customerId) {
      return res.json({
        ...settings,
        signedIn: false,
        balance: 0,
        pending: 0,
        blocks: 0,
        redeemable: false,
        blockValue: money(settings.redeemValue),
        history: [],
      })
    }
    const [balance, pending] = await Promise.all([
      pointsBalance(req.customerId),
      pendingPoints(req.customerId, settings),
    ])
    const { rows: history } = await query(
      `SELECT l.*, v.code AS voucher_code
         FROM loyalty_ledger l LEFT JOIN vouchers v ON v.id = l.voucher_id
        WHERE l.customer_id = $1
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT 100`,
      [req.customerId],
    )
    const blocks = blocksAvailable(balance, settings)
    res.json({
      ...settings,
      signedIn: true,
      balance,
      pending,
      // How many blocks they could cash in right now, and what that is worth.
      blocks,
      redeemable: blocks > 0,
      blockValue: money(settings.redeemValue),
      history: history.map(entryJson),
    })
  }),
)

// Trade points for a reward. `blocks` defaults to one — the customer chooses
// how much of their balance to spend, and nothing is ever redeemed for them.
r.post(
  '/api/loyalty/redeem',
  requireCustomer,
  ah(async (req, res) => {
    const wanted = Math.max(1, clampInt(req.body?.blocks, 1, 1000, 1))

    const result = await withTransaction(async (client) => {
      // Serialise this customer's redemptions: two taps must not both read the
      // same balance and both mint a reward.
      await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [REDEEM_LOCK_NS, req.customerId])

      const settings = await loadLoyaltySettings(client)
      if (!settings.enabled) return { error: 'The points programme is not running right now', code: 403 }

      const balance = await pointsBalance(req.customerId, client)
      const block = Math.max(1, Number(settings.redeemBlock) || 1)
      const max = blocksAvailable(balance, settings)
      if (max < 1) {
        return {
          error: `You need at least ${block.toLocaleString()} points to redeem`,
          code: 400,
          balance,
        }
      }
      if (wanted > max) {
        return {
          error:
            Number(settings.maxBlocks) > 0 && wanted > Number(settings.maxBlocks)
              ? `You can redeem up to ${Number(settings.maxBlocks) * block} points at a time`
              : 'You do not have enough points for that',
          code: 400,
          balance,
        }
      }

      const spend = wanted * block
      const worth = money(wanted * Number(settings.redeemValue))
      const days = Number(settings.voucherDays) || 0
      const label = `$${worth.toLocaleString()} off`

      let voucher = null
      for (let attempt = 0; attempt < 5 && !voucher; attempt++) {
        try {
          const { rows } = await client.query(
            `INSERT INTO vouchers
               (code, customer_id, source, type, value, min_order, label, description,
                points_spent, expires_at)
             VALUES ($1,$2,'points','amount',$3,$4,$5,$6,$7,
                     CASE WHEN $8::int > 0 THEN now() + make_interval(days => $8::int) ELSE NULL END)
             RETURNING *`,
            [
              randomCode('PTS'),
              req.customerId,
              worth,
              money(settings.minOrder),
              label,
              `Redeemed ${spend.toLocaleString()} points`,
              spend,
              days,
            ],
          )
          voucher = rows[0]
        } catch (e) {
          if (e.code !== '23505') throw e // not a code collision — a real error
        }
      }
      if (!voucher) throw new Error('Could not issue the reward code')

      // The debit and the reward are one transaction: a customer can never lose
      // the points without getting the reward, or the other way round.
      await client.query(
        `INSERT INTO loyalty_ledger (customer_id, points, kind, voucher_id, description)
         VALUES ($1, $2, 'redeem', $3, $4)`,
        [req.customerId, -spend, voucher.id, `Redeemed for ${label}`],
      )

      return {
        spent: spend,
        balance: balance - spend,
        reward: {
          id: voucher.id,
          code: voucher.code,
          value: Number(voucher.value),
          minOrder: Number(voucher.min_order),
          label,
          expiresAt: voucher.expires_at,
        },
      }
    })

    if (result.error) {
      const { error, code, ...rest } = result
      return res.status(code).json({ error, ...rest })
    }
    res.status(201).json(result)
  }),
)

// Give the points back when a reward they bought is voided or deleted by staff.
// Called from spin.js, which owns the admin voucher routes — the import goes
// that way and never comes back, so there is no cycle.
//
// Idempotent: the redeem row is a negative, so the pair sums to zero once
// refunded and a second call finds nothing to do.
export async function refundVoucherPoints(voucherId) {
  const id = Number(voucherId)
  if (!id) return 0
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, code, customer_id, points_spent FROM vouchers
        WHERE id = $1 AND source = 'points' FOR UPDATE`,
      [id],
    )
    const v = rows[0]
    if (!v || !v.customer_id) return 0

    const { rows: net } = await client.query(
      `SELECT COALESCE(SUM(points), 0)::int AS n FROM loyalty_ledger WHERE voucher_id = $1`,
      [id],
    )
    const owed = -Number(net[0].n) // the outstanding debit, if any
    if (owed <= 0) return 0

    await client.query(
      `INSERT INTO loyalty_ledger (customer_id, points, kind, voucher_id, description)
       VALUES ($1, $2, 'adjust', $3, $4)`,
      [v.customer_id, owed, id, `Reward ${v.code} cancelled — points returned`],
    )
    return owed
  })
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

r.get(
  '/api/admin/loyalty',
  requireAuth,
  ah(async (_req, res) => {
    const settings = await loadLoyaltySettings()
    const { rows: stats } = await query(
      `SELECT
         (SELECT COALESCE(SUM(points),0)::int FROM loyalty_ledger WHERE points > 0)              AS issued,
         (SELECT COALESCE(-SUM(points),0)::int FROM loyalty_ledger WHERE points < 0)             AS spent,
         (SELECT COALESCE(SUM(points),0)::int FROM loyalty_ledger)                               AS outstanding,
         (SELECT count(DISTINCT customer_id)::int FROM loyalty_ledger)                           AS members,
         (SELECT count(*)::int FROM vouchers WHERE source = 'points')                            AS rewards,
         (SELECT count(*)::int FROM vouchers WHERE source = 'points' AND status = 'active')      AS rewards_active`,
    )
    const s = stats[0]
    res.json({
      settings,
      stats: {
        issued: s.issued,
        spent: s.spent,
        // What the programme currently owes, in points and in dollars.
        outstanding: s.outstanding,
        liability: money(
          (s.outstanding / Math.max(1, settings.redeemBlock)) * settings.redeemValue,
        ),
        members: s.members,
        rewards: s.rewards,
        rewardsActive: s.rewards_active,
      },
    })
  }),
)

r.put(
  '/api/admin/loyalty',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    await query(`INSERT INTO loyalty_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`)
    const { rows } = await query(
      `UPDATE loyalty_settings SET
         enabled      = COALESCE($1, enabled),
         title        = COALESCE($2, title),
         subtitle     = COALESCE($3, subtitle),
         intro        = COALESCE($4, intro),
         terms        = COALESCE($5::jsonb, terms),
         earn_rate    = COALESCE($6, earn_rate),
         redeem_block = COALESCE($7, redeem_block),
         redeem_value = COALESCE($8, redeem_value),
         max_blocks   = COALESCE($9, max_blocks),
         min_order    = COALESCE($10, min_order),
         voucher_days = COALESCE($11, voucher_days),
         award_on     = COALESCE($12, award_on),
         updated_at   = now()
       WHERE id = 1 RETURNING *`,
      [
        typeof b.enabled === 'boolean' ? b.enabled : null,
        str(b.title, 80),
        str(b.subtitle, 160),
        str(b.intro, 1000),
        Array.isArray(b.terms)
          ? JSON.stringify(
              b.terms.filter((t) => typeof t === 'string').map((t) => t.slice(0, 300)).slice(0, 12),
            )
          : null,
        clampNum(b.earnRate, 0, 1000),
        clampInt(b.redeemBlock, 1, 1_000_000),
        clampNum(b.redeemValue, 0, 100_000),
        clampInt(b.maxBlocks, 0, 1000),
        clampNum(b.minOrder, 0, 100_000),
        clampInt(b.voucherDays, 0, 3650),
        oneOf(b.awardOn, AWARD_ON),
      ],
    )
    res.json(settingsJson(rows[0]))
  }),
)

// The ledger, newest first — filterable by customer and searchable by name /
// mobile / email, so a "where are my points?" call can be answered in one look.
r.get(
  '/api/admin/loyalty/ledger',
  requireAuth,
  ah(async (req, res) => {
    const limit = clampInt(req.query.limit, 1, 500, 100)
    const offset = clampInt(req.query.offset, 0, 1e6, 0)
    const customerId = clampInt(req.query.customerId, 1, 1e9, 0)
    const q = String(req.query.q || '').trim()
    const params = []
    const where = []
    if (customerId) {
      params.push(customerId)
      where.push(`l.customer_id = $${params.length}`)
    }
    if (q) {
      params.push(`%${q}%`)
      where.push(
        `(c.name ILIKE $${params.length} OR c.mobile ILIKE $${params.length} OR c.email ILIKE $${params.length})`,
      )
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const { rows } = await query(
      `SELECT l.*, v.code AS voucher_code, c.name AS customer_name, c.mobile AS customer_mobile
         FROM loyalty_ledger l
         LEFT JOIN vouchers  v ON v.id = l.voucher_id
         LEFT JOIN customers c ON c.id = l.customer_id
         ${clause}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    )
    const { rows: count } = await query(
      `SELECT count(*)::int AS n FROM loyalty_ledger l
         LEFT JOIN customers c ON c.id = l.customer_id ${clause}`,
      params,
    )
    res.json({
      total: count[0].n,
      entries: rows.map((e) => ({
        ...entryJson(e),
        customerId: e.customer_id,
        customerName: e.customer_name || '',
        customerMobile: e.customer_mobile || '',
        adminNote: e.admin_note || '',
      })),
    })
  }),
)

// Hand points out (or take them back) by hand — a goodwill gesture, a mistake
// to undo, a reward voided. Always a new row with a note, never an edit.
r.post(
  '/api/admin/loyalty/adjust',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const customerId = Number(b.customerId)
    const points = clampInt(b.points, -1_000_000, 1_000_000, 0)
    if (!customerId || !points) {
      return res.status(400).json({ error: 'Pick a customer and a number of points' })
    }
    const { rows: cust } = await query(`SELECT id FROM customers WHERE id = $1`, [customerId])
    if (!cust[0]) return res.status(404).json({ error: 'Customer not found' })

    const { rows } = await query(
      `INSERT INTO loyalty_ledger (customer_id, points, kind, description, admin_note)
       VALUES ($1, $2, 'adjust', $3, $4) RETURNING *`,
      [
        customerId,
        points,
        str(b.description, 200) || (points > 0 ? 'Points added by AS Company' : 'Points adjustment'),
        str(b.adminNote, 300) || '',
      ],
    )
    res.status(201).json({ ...entryJson(rows[0]), balance: await pointsBalance(customerId) })
  }),
)

// Re-run the earn reconciliation across every order. The escape hatch for
// changing `earn_rate` or `award_on` after the fact, or for backfilling the
// orders that predate the programme — it is safe to run any number of times.
r.post(
  '/api/admin/loyalty/resync',
  requireAuth,
  ah(async (_req, res) => {
    const settings = await loadLoyaltySettings()
    const { rows } = await query(
      `SELECT id FROM orders WHERE customer_id IS NOT NULL ORDER BY id`,
    )
    let changed = 0
    for (const o of rows) {
      const delta = await syncOrderPoints(o.id, { settings })
      if (delta) changed++
    }
    console.log(`[points] resync: ${changed}/${rows.length} orders adjusted`)
    res.json({ orders: rows.length, changed })
  }),
)

export { LEDGER_KINDS, AWARD_ON }
