// AS-Punch licence renewal, paid through the store.
//
// An AS-Punch installation's "Renew" button opens /product/RaiOne?renewal=<code>.
// The code is issued by the AS-Punch licence server, and that server alone
// decides what a month costs:
//
//   1. The storefront shows the amount GET /api/license-renewals/:code returns,
//      greyed out — there is nothing to type.
//   2. POST /api/orders resolves the code AGAIN and prices the line from that
//      answer. The quantity the browser sent is ignored for this line, so an
//      edited request changes nothing.
//   3. Once Whish confirms the payment (markWhishPaid, which asks Whish itself),
//      the order is reported to the licence server, which checks the amount
//      against its own figure once more and extends the licence one month.
//
// Every call to the licence server is signed with LICENSE_SERVER_BILLING_SECRET
// (HMAC over the exact body), which is also the only thing that lets the store
// report a payment at all. A paid renewal is never lost: the order carries its
// own retry state (db/license_renewal.sql) and is re-sent until the licence
// server answers. The licence server is idempotent on the order id, so sending
// twice renews once.

import crypto from 'node:crypto'
import express from 'express'
import { query } from './db.js'

const BASE = (process.env.LICENSE_SERVER_URL || '').replace(/\/$/, '')
const SECRET = process.env.LICENSE_SERVER_BILLING_SECRET || ''
const TIMEOUT_MS = 10_000
const WORKER_INTERVAL_MS = Math.max(10_000, Number(process.env.LICENSE_RENEWAL_WORKER_INTERVAL_MS) || 60_000)

const log = (...args) => console.log('[license-renewal]', ...args)

export const licenseRenewalEnabled = () => Boolean(BASE && SECRET)

// The licence server mints 24 URL-safe characters; anything else is not a code
// and is refused before it costs a round trip.
const CODE_RE = /^[A-Za-z0-9_-]{16,64}$/
export const isRenewalCode = (value) => typeof value === 'string' && CODE_RE.test(value)

// Seconds before retry n (1-based): 30s, 1m, 2m, 4m ... capped at an hour. The
// cap, not a give-up: a paid renewal is retried until it lands.
export const retryDelaySeconds = (attempt) => Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1))

export function signBody(raw, timestamp, secret = SECRET) {
  return `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')}`
}

async function call(path, body) {
  if (!licenseRenewalEnabled()) throw new Error('licence renewal is not configured (LICENSE_SERVER_URL / LICENSE_SERVER_BILLING_SECRET)')
  const raw = JSON.stringify(body)
  const timestamp = String(Math.floor(Date.now() / 1000))
  let response
  try {
    response = await fetch(`${BASE}/api/billing${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Store-Timestamp': timestamp,
        'X-Store-Signature': signBody(raw, timestamp),
      },
      body: raw,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (cause) {
    throw new Error(`licence server unreachable: ${cause?.message || cause}`)
  }
  const text = await response.text()
  let payload = {}
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = {}
  }
  if (!response.ok) {
    throw new Error(`licence server ${path} HTTP ${response.status}: ${payload?.message || text.slice(0, 200)}`)
  }
  return payload?.data ?? {}
}

/** The licence server's answer for a code — see its renewalService.resolve. */
export const resolveRenewal = (code) => call('/renewals/resolve', { code })

/** Why a resolved code cannot be paid, worded for the customer; null if it can. */
export function renewalRefusal(resolved) {
  switch (resolved?.status) {
    case 'payable':
      if (resolved.currency !== 'USD' || !(Number(resolved.amount) >= 1)) {
        return 'This licence cannot be renewed online. Please contact support.'
      }
      return null
    case 'paid':
      return 'This licence has already been renewed with this link.'
    case 'expired':
    case 'superseded':
      return 'This renewal link has expired. Open Renew again from your AS-Punch system to get a new one.'
    case 'unavailable':
      return 'This licence cannot be renewed online. Please contact support.'
    default:
      return 'This renewal link is not valid.'
  }
}

// What the storefront may see about a code. The licence key never leaves the
// licence server; the company name is what tells the customer they are paying
// for the right business.
const publicView = (r) => ({
  status: r.status,
  companyName: r.companyName || null,
  amount: r.amount ?? null,
  currency: r.currency || 'USD',
  periodMonths: r.periodMonths || 1,
  licenseExpiresAt: r.licenseExpiresAt || null,
  newExpiresAt: r.newExpiresAt || null,
  linkExpiresAt: r.linkExpiresAt || null,
  paidAt: r.paidAt || null,
  message: renewalRefusal(r),
})

/** The renewal as an order exposes it (orderJson). Null on ordinary orders. */
export function licenseRenewalJson(row) {
  if (!row?.license_renewal_code) return null
  const result = row.license_renewal_result && typeof row.license_renewal_result === 'object' ? row.license_renewal_result : {}
  return {
    status: row.license_renewal_status,
    companyName: result.companyName || null,
    periodMonths: result.periodMonths || 1,
    newExpiresAt: result.newExpiresAt || null,
    reason: result.reason || null,
  }
}

/**
 * Report one paid renewal. Never throws: a failure schedules the next attempt
 * on the order itself. Returns the order's renewal status afterwards.
 */
export async function processLicenseRenewal(orderId) {
  const { rows } = await query(
    `SELECT id, license_renewal_code, license_renewal_status, license_renewal_attempts, license_renewal_result,
            subtotal, delivery_fee, vat_amount, discount_amount, wallet_amount, currency
       FROM orders WHERE id = $1`,
    [orderId],
  )
  const order = rows[0]
  if (!order || order.license_renewal_status !== 'pending') return order?.license_renewal_status || null

  // What Whish collected — exclusive orders carry no delivery, VAT, discount or
  // wallet, but the arithmetic is the order's own rather than an assumption.
  const amount =
    Math.round(
      (Number(order.subtotal || 0) +
        Number(order.delivery_fee || 0) +
        Number(order.vat_amount || 0) -
        Number(order.discount_amount || 0) -
        Number(order.wallet_amount || 0)) *
        100,
    ) / 100
  const previous = order.license_renewal_result && typeof order.license_renewal_result === 'object' ? order.license_renewal_result : {}

  try {
    const data = await call('/renewals/payments', {
      code: order.license_renewal_code,
      orderId: order.id,
      amount,
      currency: order.currency || 'USD',
      paidAt: previous.paidAt || new Date().toISOString(),
    })
    const status = data?.outcome === 'applied' ? 'applied' : 'refused'
    const result = {
      ...previous,
      companyName: data?.companyName || previous.companyName || null,
      newExpiresAt: data?.newExpiresAt || null,
      previousExpiresAt: data?.previousExpiresAt || null,
      reason: data?.reason || null,
    }
    await query(
      `UPDATE orders
          SET license_renewal_status = $2, license_renewal_result = $3::jsonb, license_renewal_error = '',
              license_renewal_attempts = license_renewal_attempts + 1, license_renewal_next_at = NULL
        WHERE id = $1 AND license_renewal_status = 'pending'`,
      [order.id, status, JSON.stringify(result)],
    )
    if (status === 'applied') log(`order #${order.id} → licence renewed until ${result.newExpiresAt}`)
    else console.error(`[license-renewal] order #${order.id} PAID but the licence was NOT renewed (${result.reason}) — refund or renew by hand`)
    return status
  } catch (e) {
    const attempts = Number(order.license_renewal_attempts || 0) + 1
    const wait = retryDelaySeconds(attempts)
    console.error(`[license-renewal] order #${order.id} report failed (attempt ${attempts}), retrying in ${wait}s:`, e?.message || e)
    await query(
      `UPDATE orders
          SET license_renewal_attempts = $2, license_renewal_error = $3,
              license_renewal_next_at = now() + make_interval(secs => $4)
        WHERE id = $1 AND license_renewal_status = 'pending'`,
      [order.id, attempts, String(e?.message || e).slice(0, 500), wait],
    ).catch((err) => console.error('[license-renewal] could not schedule retry:', err?.message || err))
    return 'pending'
  }
}

/**
 * Called once Whish has confirmed an order paid. A no-op for every order that
 * is not a licence renewal. Reports straight away so the customer's order page
 * can already say "renewed"; anything that fails is picked up by the worker.
 */
export async function queueLicenseRenewal(orderId) {
  try {
    const { rowCount } = await query(
      `UPDATE orders
          SET license_renewal_status = 'pending', license_renewal_next_at = now(),
              license_renewal_result = COALESCE(license_renewal_result, '{}'::jsonb) || jsonb_build_object('paidAt', now())
        WHERE id = $1 AND license_renewal_code IS NOT NULL AND license_renewal_status = 'awaiting_payment'`,
      [orderId],
    )
    if (!rowCount) return
    log(`order #${orderId} paid → reporting to the licence server`)
    await processLicenseRenewal(orderId)
  } catch (e) {
    console.error(`[license-renewal] queue order #${orderId}:`, e?.message || e)
  }
}

let timer = null
let running = false

async function drain() {
  if (running) return
  running = true
  try {
    const { rows } = await query(
      `SELECT id FROM orders
        WHERE license_renewal_status = 'pending' AND license_renewal_next_at <= now()
        ORDER BY license_renewal_next_at LIMIT 20`,
    )
    for (const { id } of rows) await processLicenseRenewal(id)
  } finally {
    running = false
  }
}

export function startLicenseRenewalWorker() {
  if (timer) return
  timer = setInterval(() => {
    drain().catch((e) => console.error('[license-renewal] worker tick failed:', e?.message || e))
  }, WORKER_INTERVAL_MS)
  timer.unref?.()
  log(`worker started (every ${WORKER_INTERVAL_MS / 1000}s, licence server ${BASE || '(unset)'}, enabled=${licenseRenewalEnabled()})`)
}

// A small per-client ceiling on code lookups. Codes are 24 random characters,
// so this is not what protects them — it keeps a burst from spending the
// licence server's own rate limit for every other customer.
const LOOKUPS_PER_MINUTE = 30
const lookups = new Map()
function allowLookup(req) {
  const key = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim()
  const now = Date.now()
  const entry = lookups.get(key)
  if (!entry || now - entry.start > 60_000) {
    lookups.set(key, { start: now, count: 1 })
    if (lookups.size > 5000) lookups.clear()
    return true
  }
  entry.count += 1
  return entry.count <= LOOKUPS_PER_MINUTE
}

export const licenseRenewalRouter = express.Router()

licenseRenewalRouter.get('/api/license-renewals/:code', async (req, res) => {
  const code = String(req.params.code || '')
  if (!licenseRenewalEnabled()) {
    return res.status(503).json({ error: 'Online licence renewal is unavailable right now.', code: 'renewal_unavailable' })
  }
  if (!isRenewalCode(code)) return res.status(404).json(publicView({ status: 'not_found' }))
  if (!allowLookup(req)) return res.status(429).json({ error: 'Too many requests. Try again in a minute.' })
  try {
    const resolved = await resolveRenewal(code)
    res.set('Cache-Control', 'no-store')
    return res.status(resolved?.status === 'not_found' ? 404 : 200).json(publicView(resolved))
  } catch (e) {
    console.error('[license-renewal] resolve failed:', e?.message || e)
    return res.status(502).json({ error: 'Could not reach the licensing server. Please try again in a moment.', code: 'renewal_unreachable' })
  }
})
