// Whish Pay client — a thin fetch wrapper around the itel-service payment API.
// The secret lives only in env and is never exposed to the browser. The status
// endpoint (getCollectStatus) is the source of truth for whether an order is
// paid; the inbound callback is only a faster trigger for the same check.
//
// Docs: https://whish-partners.pages.dev/whish-pay-9z366gc6922w/

const BASE = (process.env.WHISH_BASE_URL || 'https://partner.api.sbx.whish.money/itel-service/api').replace(
  /\/$/,
  '',
)
const CHANNEL = process.env.WHISH_CHANNEL || ''
const SECRET = process.env.WHISH_SECRET || ''
const WEBSITE_URL = process.env.WHISH_WEBSITE_URL || ''
const USER_AGENT = process.env.WHISH_USER_AGENT || 'AS-Store/1.0 (store.as.com.lb; orders@as.com.lb)'

// Only offer online payment when the credentials are actually configured.
export const whishEnabled = () => Boolean(CHANNEL && SECRET && WEBSITE_URL)

// Verbose flow logging (prefixed [whish]) so the payment path is traceable in the
// PM2 out log. The secret is never logged — only the channel identifier.
const log = (...a) => console.log('[whish]', ...a)

log(
  `config: base=${BASE} channel=${CHANNEL || '(unset)'} website=${WEBSITE_URL || '(unset)'} enabled=${whishEnabled()}`,
)

function headers() {
  return {
    'Content-Type': 'application/json',
    channel: CHANNEL,
    secret: SECRET,
    websiteurl: WEBSITE_URL,
    'User-Agent': USER_AGENT,
  }
}

// POST helper. Whish wraps responses as { status: bool, code, dialog, data }.
// A false `status` is a business error even on HTTP 200, so surface it.
async function call(path, body) {
  log(`→ POST ${path}`, JSON.stringify(body))
  let res
  try {
    res = await fetch(`${BASE}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  } catch (e) {
    log(`✗ ${path} unreachable:`, e?.message || e)
    throw new Error(`Whish ${path} unreachable: ${e?.message || e}`)
  }
  const text = await res.text()
  let j = {}
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    j = { raw: text }
  }
  log(`← ${path} HTTP ${res.status}:`, text ? text.slice(0, 800) : '(empty body)')
  if (!res.ok) throw new Error(`Whish ${path} HTTP ${res.status}: ${text?.slice(0, 300)}`)
  if (j.status === false) {
    const msg = j?.dialog?.message || j?.message || j?.code || 'request failed'
    log(`✗ ${path} business error:`, msg)
    throw new Error(`Whish ${path}: ${msg}`)
  }
  return j
}

// Create a payment link. externalId is our own unique reference (the order id);
// currency USD amounts carry 2 decimals. Returns the hosted collectUrl to send
// the customer to. All four URLs must be publicly reachable (Whish 403s localhost).
export async function createPayment({
  amount,
  currency = 'USD',
  externalId,
  invoice = '',
  successCallbackUrl,
  failureCallbackUrl,
  successRedirectUrl,
  failureRedirectUrl,
}) {
  const amt = Number(Number(amount).toFixed(currency === 'USD' ? 2 : 0))
  log(`createPayment: externalId=${externalId} amount=${amt} ${currency} invoice="${invoice}"`)
  const j = await call('/payment/whish', {
    amount: amt,
    currency,
    invoice,
    externalId: Number(externalId),
    successCallbackUrl,
    failureCallbackUrl,
    successRedirectUrl,
    failureRedirectUrl,
  })
  const data = j?.data ?? j
  const collectUrl = data.collectUrl || data.collecturl || data.url
  if (!collectUrl) {
    log('✗ createPayment: no collectUrl in response', JSON.stringify(j).slice(0, 500))
    throw new Error('Whish: no collectUrl in response')
  }
  log(`createPayment: collectUrl=${collectUrl}`)
  return { collectUrl, raw: j }
}

// Ask Whish for the settled status of a payment. collectStatus is one of
// pending | success | failed | refunded | unknown — only success/failed are final.
export async function getCollectStatus({ externalId, currency = 'USD' }) {
  log(`getCollectStatus: externalId=${externalId} ${currency}`)
  const j = await call('/payment/collect/status', { externalId: Number(externalId), currency })
  const data = j?.data ?? j
  const collectStatus = data.collectStatus || 'unknown'
  log(`getCollectStatus: externalId=${externalId} → collectStatus=${collectStatus}`)
  return { collectStatus, raw: j }
}
