// AS Wallet — store credit: money back on what you spend, spent straight off
// the next order. This replaced AS Points; the deal is the same, but the unit is
// the one the customer already thinks in, so there is nothing to convert and
// nothing to redeem before it can be used.
//
// Three rules carry the whole feature, and all three live here rather than on
// any client:
//
//  1. **Credit is reconciled from orders, never appended.** `syncOrderWallet()`
//     works out what an order *should* have credited and writes the difference
//     against what it already credited. Call it as often as you like, from
//     wherever an order changes — delivered, cancelled, delivered again — and
//     the customer ends up with the right balance exactly once.
//
//  2. **Spending is claimed before the order exists.** `spendFromWallet()`
//     writes the debit under a per-customer lock and hands back an entry id;
//     checkout then stamps the order onto it, or gives it back. That ordering
//     is what stops the same balance being spent twice from two devices — the
//     same shape `redeemVoucher`/`releaseVoucher` uses in spin.js, for the same
//     reason.
//
//  3. **The balance is always SUM(wallet_ledger.amount).** There is no cached
//     total that could fall out of step with the history the customer reads.
//
// A wallet spend is a *payment*, not a discount: it comes off after VAT, which
// is charged on the goods whoever's money buys them. Vouchers are unaffected and
// can still apply to the same order — they discount the goods, the wallet pays
// what is left.

import express from 'express'
import { query, withTransaction } from './db.js'
import { requireAuth } from './auth.js'
import { optionalCustomer } from './customerAuth.js'

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export const walletRouter = express.Router()
const r = walletRouter

// Namespaces for the per-customer / per-order advisory locks. Distinct from the
// spin's so a wallet spend and a spin never block each other.
const SPEND_LOCK_NS = 918276
const ORDER_LOCK_NS = 918277

// Which order statuses have "earned" their credit, per the `award_on` setting.
// Cancelled is absent from all three on purpose: a cancelled order always gives
// its credit back.
const QUALIFYING = {
  delivered: ['delivered'],
  confirmed: ['confirmed', 'shipped', 'delivered'],
  created: ['pending', 'confirmed', 'shipped', 'delivered'],
}
const AWARD_ON = Object.keys(QUALIFYING)
const LEDGER_KINDS = ['earn', 'revoke', 'spend', 'refund', 'adjust']

// Money is rounded to cents at every boundary — a balance that is the sum of a
// hundred rows must not accumulate a hundred rounding errors.
const money = (v) => Math.round((Number(v) || 0) * 100) / 100
const clampInt = (v, lo, hi, fallback = null) =>
  Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : fallback
const clampNum = (v, lo, hi, fallback = null) =>
  Number.isFinite(Number(v)) ? money(Math.min(hi, Math.max(lo, Number(v)))) : fallback
const oneOf = (v, list) => (list.includes(v) ? v : null)
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null)

// Thrown for anything the customer can fix by changing their order. Checkout
// turns it into a 400 with this message; anything else is a real failure.
export class WalletError extends Error {}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const settingsJson = (s) => ({
  enabled: Boolean(s.enabled),
  title: s.title || 'AS Wallet',
  subtitle: s.subtitle || '',
  intro: s.intro || '',
  terms: Array.isArray(s.terms) ? s.terms : [],
  earnPercent: Number(s.earn_percent ?? 5),
  minOrder: Number(s.min_order ?? 0),
  maxPercent: Number(s.max_percent ?? 100),
  awardOn: s.award_on || 'delivered',
  updatedAt: s.updated_at,
})

export async function loadWalletSettings(db = { query }) {
  await db.query(`INSERT INTO wallet_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`)
  const { rows } = await db.query(`SELECT * FROM wallet_settings WHERE id = 1`)
  return settingsJson(rows[0])
}

// ---------------------------------------------------------------------------
// Earning
// ---------------------------------------------------------------------------

// What an order credits back.
//
// The basis is the money that actually bought goods: the items subtotal, less
// any discount that came off those items, less whatever the wallet itself paid.
// Delivery and VAT never earn — they aren't spend on our catalogue — and a
// free-delivery voucher therefore doesn't reduce the basis either, which is why
// the voucher's type is joined in.
//
// Subtracting the wallet payment is what stops credit earning credit: without
// it, $50 of credit spent would hand back another $2.50, for ever. Rounded down
// to the cent, so we never credit money that wasn't paid.
export const walletEarnFor = (order, settings) => {
  const subtotal = Number(order.subtotal) || 0
  const discount =
    order.voucher_type === 'free_delivery' ? 0 : Number(order.discount_amount) || 0
  const paidFromWallet = Number(order.wallet_amount) || 0
  const basis = Math.max(0, subtotal - discount - paidFromWallet)
  return Math.max(0, Math.floor(basis * (Number(settings.earnPercent) || 0)) / 100)
}

// Bring one order's earned credit in line with what it should have earned.
//
// Idempotent by construction: it reads the earn/revoke rows this order has
// already produced and writes only the difference, so re-running it — after a
// status flip, a re-delivery, a settings change — converges instead of
// duplicating. Returns the delta it wrote (0 when nothing needed to change).
//
// Deliberately scoped to earning: a `spend` on the same order is the customer's
// money, not ours to reconcile, and is given back by `refundOrderWallet()`.
export async function syncOrderWallet(orderId, opts = {}) {
  const id = Number(orderId)
  if (!id) return 0
  const settings = opts.settings || (await loadWalletSettings())

  return withTransaction(async (client) => {
    // Serialise per order: two admins flipping the same order at once would
    // otherwise both read "nothing credited yet" and both credit.
    await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [ORDER_LOCK_NS, id])

    const { rows } = await client.query(
      `SELECT o.id, o.customer_id, o.status, o.subtotal, o.discount_amount, o.wallet_amount,
              v.type AS voucher_type
         FROM orders o LEFT JOIN vouchers v ON v.id = o.voucher_id
        WHERE o.id = $1`,
      [id],
    )
    const order = rows[0]
    // No owner (a deleted account) means nobody to credit.
    if (!order || !order.customer_id) return 0

    const qualifies =
      settings.enabled && QUALIFYING[settings.awardOn]?.includes(order.status)
    const desired = qualifies ? walletEarnFor(order, settings) : 0

    const { rows: already } = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS n FROM wallet_ledger
        WHERE order_id = $1 AND kind IN ('earn','revoke')`,
      [id],
    )
    const delta = money(desired - Number(already[0].n))
    if (!delta) return 0

    await client.query(
      `INSERT INTO wallet_ledger (customer_id, amount, kind, order_id, description)
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
// because the wallet ledger had a bad day.
export const syncOrderWalletSafe = (orderId) =>
  syncOrderWallet(orderId).catch((e) =>
    console.error(`[wallet] sync order #${orderId}:`, e?.message || e),
  )

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

export async function walletBalance(customerId, db = { query }) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS n FROM wallet_ledger WHERE customer_id = $1`,
    [customerId],
  )
  return money(rows[0].n)
}

// Credit sitting on orders that haven't qualified yet — "on the way". Shown so a
// customer who just ordered can see it coming rather than assuming the wallet is
// broken.
async function pendingCredit(customerId, settings) {
  if (!settings.enabled) return 0
  const qualifying = QUALIFYING[settings.awardOn] || QUALIFYING.delivered
  const { rows } = await query(
    `SELECT o.id, o.subtotal, o.discount_amount, o.wallet_amount, v.type AS voucher_type
       FROM orders o LEFT JOIN vouchers v ON v.id = o.voucher_id
      WHERE o.customer_id = $1
        AND o.status <> 'cancelled'
        AND NOT (o.status = ANY($2::text[]))`,
    [customerId, qualifying],
  )
  return money(rows.reduce((n, o) => n + walletEarnFor(o, settings), 0))
}

// ---------------------------------------------------------------------------
// Spending
// ---------------------------------------------------------------------------

// The most of one order the wallet is allowed to cover, given the rules. Shared
// with the clients through `GET /api/wallet`, so the amount a checkout shows and
// the amount the server takes are worked out by the same code.
export function spendableOn(total, balance, settings) {
  if (!settings.enabled) return 0
  const orderTotal = money(total)
  if (orderTotal <= 0) return 0
  if (orderTotal < money(settings.minOrder)) return 0
  const pct = Math.min(100, Math.max(0, Number(settings.maxPercent) || 0))
  const cap = money((orderTotal * pct) / 100)
  return Math.max(0, Math.min(money(balance), cap, orderTotal))
}

// Claim credit for an order that does not exist yet.
//
// The debit is written here, under a per-customer lock, and only then does
// checkout build the order around it — the same ordering that makes a voucher
// impossible to spend twice. `attachWalletSpend` stamps the order on afterwards;
// `releaseWalletSpend` gives it back if anything below fails.
//
// `amount` is what the customer asked to spend; what comes back is what the
// rules actually allowed, which may be less. Checkout must price from the
// returned figure, never from the requested one.
export async function spendFromWallet({ customerId, amount, total }) {
  const wanted = money(amount)
  if (!customerId || wanted <= 0) return null

  return withTransaction(async (client) => {
    // Serialise this customer's spends: two checkouts must not both read the
    // same balance and both spend it.
    await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [SPEND_LOCK_NS, customerId])

    const settings = await loadWalletSettings(client)
    if (!settings.enabled) throw new WalletError('The wallet is not available right now')

    const balance = await walletBalance(customerId, client)
    if (balance <= 0) throw new WalletError('Your wallet is empty')
    if (money(total) < money(settings.minOrder)) {
      throw new WalletError(
        `Your wallet can be used on orders of $${money(settings.minOrder)} or more`,
      )
    }

    const allowed = spendableOn(total, balance, settings)
    const spend = Math.min(wanted, allowed)
    if (spend <= 0) throw new WalletError('Your wallet cannot be used on this order')

    const { rows } = await client.query(
      `INSERT INTO wallet_ledger (customer_id, amount, kind, description)
       VALUES ($1, $2, 'spend', 'Paid from your wallet') RETURNING id`,
      [customerId, -spend],
    )
    return { entryId: Number(rows[0].id), amount: spend, balanceAfter: money(balance - spend) }
  })
}

// Stamp the order onto a claimed spend, once it exists.
export const attachWalletSpend = (entryId, orderId) =>
  query(
    `UPDATE wallet_ledger SET order_id = $2, description = $3
      WHERE id = $1 AND kind = 'spend'`,
    [entryId, orderId, `Paid towards order #${orderId}`],
  )

// Give back a claim whose order never happened. Append-only, like everything
// else here: the debit stays and a matching credit lands beside it.
export async function releaseWalletSpend(entryId) {
  const id = Number(entryId)
  if (!id) return 0
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, customer_id, amount, order_id FROM wallet_ledger
        WHERE id = $1 AND kind = 'spend' FOR UPDATE`,
      [id],
    )
    const entry = rows[0]
    if (!entry) return 0
    // Already refunded once — the pair sums to zero and there is nothing owed.
    // Matched on the note rather than the order, because a claim released this
    // way never got an order in the first place.
    const { rows: net } = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS n FROM wallet_ledger
        WHERE kind = 'refund' AND admin_note = $1`,
      [`refund:${id}`],
    )
    const owed = money(-Number(entry.amount) - Number(net[0].n))
    if (owed <= 0) return 0
    await client.query(
      `INSERT INTO wallet_ledger (customer_id, amount, kind, order_id, description, admin_note)
       VALUES ($1, $2, 'refund', $3, $4, $5)`,
      [entry.customer_id, owed, entry.order_id, 'Wallet credit returned', `refund:${id}`],
    )
    return owed
  })
}

// Give back whatever the wallet paid towards an order that has been cancelled.
//
// Idempotent: the spend rows are negative and the refunds positive, so once the
// pair nets to zero a second call finds nothing owed. It deliberately does not
// re-charge if the order is reopened — an admin who reverses a cancellation
// should collect the difference like any other payment, the same rule vouchers
// already follow.
export async function refundOrderWallet(orderId) {
  const id = Number(orderId)
  if (!id) return 0
  return withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [ORDER_LOCK_NS, id])
    const { rows } = await client.query(
      `SELECT customer_id, COALESCE(SUM(amount), 0)::numeric AS n FROM wallet_ledger
        WHERE order_id = $1 AND kind IN ('spend','refund')
        GROUP BY customer_id`,
      [id],
    )
    let given = 0
    for (const row of rows) {
      const owed = money(-Number(row.n))
      if (owed <= 0) continue
      await client.query(
        `INSERT INTO wallet_ledger (customer_id, amount, kind, order_id, description)
         VALUES ($1, $2, 'refund', $3, $4)`,
        [row.customer_id, owed, id, `Order #${id} cancelled — wallet credit returned`],
      )
      given = money(given + owed)
    }
    return given
  })
}

export const refundOrderWalletSafe = (orderId) =>
  refundOrderWallet(orderId).catch((e) =>
    console.error(`[wallet] refund order #${orderId}:`, e?.message || e),
  )

// ---------------------------------------------------------------------------
// Customer API
// ---------------------------------------------------------------------------

const entryJson = (e) => ({
  id: Number(e.id),
  amount: Number(e.amount),
  kind: e.kind,
  orderId: e.order_id,
  description: e.description || '',
  createdAt: e.created_at,
})

// The wallet, plus this customer's standing in it. Signed in gives the balance
// and history; signed out still returns the rules so the page can explain the
// deal behind a sign-in prompt.
//
// `?total=` asks the one question a checkout has: how much of this balance may
// this order actually use. Answered here so the client never re-implements the
// money rules — the same reason the vouchers list carries its own `discount`.
r.get(
  '/api/wallet',
  optionalCustomer,
  ah(async (req, res) => {
    const settings = await loadWalletSettings()
    const total = Number(req.query.total) || 0
    if (!req.customerId) {
      return res.json({
        ...settings,
        signedIn: false,
        balance: 0,
        pending: 0,
        spendable: 0,
        history: [],
      })
    }
    const [balance, pending] = await Promise.all([
      walletBalance(req.customerId),
      pendingCredit(req.customerId, settings),
    ])
    const { rows: history } = await query(
      `SELECT * FROM wallet_ledger
        WHERE customer_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 100`,
      [req.customerId],
    )
    res.json({
      ...settings,
      signedIn: true,
      balance,
      pending,
      // What this exact order could take, when one was named.
      spendable: total > 0 ? spendableOn(total, balance, settings) : 0,
      history: history.map(entryJson),
    })
  }),
)

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

r.get(
  '/api/admin/wallet',
  requireAuth,
  ah(async (_req, res) => {
    const settings = await loadWalletSettings()
    const { rows: stats } = await query(
      `SELECT
         (SELECT COALESCE(SUM(amount),0)::numeric  FROM wallet_ledger WHERE amount > 0)  AS issued,
         (SELECT COALESCE(-SUM(amount),0)::numeric FROM wallet_ledger WHERE amount < 0)  AS spent,
         (SELECT COALESCE(SUM(amount),0)::numeric  FROM wallet_ledger)                   AS outstanding,
         (SELECT count(DISTINCT customer_id)::int  FROM wallet_ledger)                   AS members,
         (SELECT count(*)::int FROM orders WHERE wallet_amount > 0)                      AS orders_paid`,
    )
    const s = stats[0]
    res.json({
      settings,
      stats: {
        issued: money(s.issued),
        spent: money(s.spent),
        // What the wallet currently owes — this is real money the shop will hand
        // back in goods, so it is the number worth watching.
        liability: money(s.outstanding),
        members: s.members,
        ordersPaid: s.orders_paid,
      },
    })
  }),
)

r.put(
  '/api/admin/wallet',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    await query(`INSERT INTO wallet_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`)
    const { rows } = await query(
      `UPDATE wallet_settings SET
         enabled      = COALESCE($1, enabled),
         title        = COALESCE($2, title),
         subtitle     = COALESCE($3, subtitle),
         intro        = COALESCE($4, intro),
         terms        = COALESCE($5::jsonb, terms),
         earn_percent = COALESCE($6, earn_percent),
         min_order    = COALESCE($7, min_order),
         max_percent  = COALESCE($8, max_percent),
         award_on     = COALESCE($9, award_on),
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
        clampNum(b.earnPercent, 0, 100),
        clampNum(b.minOrder, 0, 100_000),
        clampInt(b.maxPercent, 0, 100),
        oneOf(b.awardOn, AWARD_ON),
      ],
    )
    res.json(settingsJson(rows[0]))
  }),
)

// The ledger, newest first — filterable by customer and searchable by name /
// mobile / email, so a "where is my credit?" call can be answered in one look.
r.get(
  '/api/admin/wallet/ledger',
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
      `SELECT l.*, c.name AS customer_name, c.mobile AS customer_mobile
         FROM wallet_ledger l
         LEFT JOIN customers c ON c.id = l.customer_id
         ${clause}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    )
    const { rows: count } = await query(
      `SELECT count(*)::int AS n FROM wallet_ledger l
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

// Put money in a wallet (or take it back) by hand — a goodwill gesture, a
// mistake to undo, a return settled in credit. Always a new row with a note,
// never an edit.
r.post(
  '/api/admin/wallet/adjust',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const customerId = Number(b.customerId)
    const amount = clampNum(b.amount, -1_000_000, 1_000_000, 0)
    if (!customerId || !amount) {
      return res.status(400).json({ error: 'Pick a customer and an amount' })
    }
    const { rows: cust } = await query(`SELECT id FROM customers WHERE id = $1`, [customerId])
    if (!cust[0]) return res.status(404).json({ error: 'Customer not found' })

    const { rows } = await query(
      `INSERT INTO wallet_ledger (customer_id, amount, kind, description, admin_note)
       VALUES ($1, $2, 'adjust', $3, $4) RETURNING *`,
      [
        customerId,
        amount,
        str(b.description, 200) ||
          (amount > 0 ? 'Credit added by AS Company' : 'Wallet adjustment'),
        str(b.adminNote, 300) || '',
      ],
    )
    res.status(201).json({ ...entryJson(rows[0]), balance: await walletBalance(customerId) })
  }),
)

// Re-run the earn reconciliation across every order. The escape hatch for
// changing `earn_percent` or `award_on` after the fact, or for backfilling the
// orders that predate the wallet — it is safe to run any number of times.
r.post(
  '/api/admin/wallet/resync',
  requireAuth,
  ah(async (_req, res) => {
    const settings = await loadWalletSettings()
    const { rows } = await query(
      `SELECT id FROM orders WHERE customer_id IS NOT NULL ORDER BY id`,
    )
    let changed = 0
    for (const o of rows) {
      const delta = await syncOrderWallet(o.id, { settings })
      if (delta) changed++
    }
    console.log(`[wallet] resync: ${changed}/${rows.length} orders adjusted`)
    res.json({ orders: rows.length, changed })
  }),
)

export { LEDGER_KINDS, AWARD_ON }
