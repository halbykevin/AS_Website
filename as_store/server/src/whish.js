// Whish Pay server client. Credentials never leave the API process.
// Current reference: https://whish-partners.pages.dev/whish-pay-9z366gc6922w/

const BASE = (process.env.WHISH_BASE_URL || 'https://partner.api.sbx.whish.money/itel-service/api').replace(
  /\/$/,
  '',
)
const CHANNEL = process.env.WHISH_CHANNEL || ''
const SECRET = process.env.WHISH_SECRET || ''
const WEBSITE_URL = process.env.WHISH_WEBSITE_URL || ''
const USER_AGENT = process.env.WHISH_USER_AGENT || 'AS-Store/1.0 (https://store.as.com.lb; orders@as.com.lb)'

export const whishEnabled = () => Boolean(CHANNEL && SECRET && WEBSITE_URL)

const log = (...args) => console.log('[whish]', ...args)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

log(
  `config: base=${BASE} channel=${CHANNEL || '(unset)'} website=${WEBSITE_URL || '(unset)'} enabled=${whishEnabled()}`,
)

function headers() {
  return {
    'Content-Type': 'application/json',
    channel: CHANNEL,
    secret: SECRET,
    websiteUrl: WEBSITE_URL,
    'User-Agent': USER_AGENT,
  }
}

// Whish uses an HTTP-200 envelope. status:false/code:500 is an unknown result,
// not a final failure. Errors mark whether the exact same externalId is safe to
// retry so callers cannot accidentally create a second payment.
async function call(path, body) {
  log(`POST ${path}`, JSON.stringify(body))
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    })
  } catch (cause) {
    const error = new Error(`Whish ${path} unreachable: ${cause?.message || cause}`)
    error.retryable = true
    throw error
  }

  const text = await response.text()
  let payload = {}
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { raw: text }
  }

  log(`${path} HTTP ${response.status}:`, text ? text.slice(0, 800) : '(empty body)')
  if (!response.ok) {
    const error = new Error(`Whish ${path} HTTP ${response.status}: ${text?.slice(0, 300)}`)
    error.retryable = response.status >= 500
    throw error
  }
  if (payload.status === false) {
    const message = payload?.dialog?.message || payload?.message || payload?.code || 'request failed'
    const error = new Error(`Whish ${path}: ${message}`)
    error.code = String(payload?.code ?? '')
    error.retryable = error.code === '500'
    throw error
  }
  return payload
}

async function callWithRetry(path, body, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await call(path, body)
    } catch (error) {
      lastError = error
      if (!error?.retryable || attempt === attempts) throw error
      const waitMs = 250 * 2 ** (attempt - 1)
      log(`retrying ${path} with the same externalId in ${waitMs}ms (attempt ${attempt + 1}/${attempts})`)
      await delay(waitMs)
    }
  }
  throw lastError
}

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
  const numericAmount = Number(amount)
  const minimum = currency === 'USD' ? 1 : 1000
  if (!Number.isFinite(numericAmount) || numericAmount < minimum) {
    throw new Error(`Whish: ${currency} amount must be at least ${minimum}`)
  }

  // The v1.4.4 contract requires amount and externalId to be JSON strings.
  const normalizedAmount = numericAmount.toFixed(currency === 'USD' ? 2 : 0)
  const normalizedExternalId = String(externalId)
  log(
    `createPayment: externalId=${normalizedExternalId} amount=${normalizedAmount} ${currency} invoice="${invoice}"`,
  )
  const payload = await callWithRetry('/payment/whish', {
    amount: normalizedAmount,
    currency,
    invoice,
    externalId: normalizedExternalId,
    successCallbackUrl,
    failureCallbackUrl,
    successRedirectUrl,
    failureRedirectUrl,
  })
  const data = payload?.data ?? payload
  const collectUrl = data.collectUrl || data.collecturl || data.url
  if (!collectUrl) throw new Error('Whish: no collectUrl in response')
  return { collectUrl, raw: payload }
}

export async function getCollectStatus({ externalId, currency = 'USD' }) {
  const normalizedExternalId = String(externalId)
  log(`getCollectStatus: externalId=${normalizedExternalId} ${currency}`)
  const payload = await callWithRetry('/payment/collect/status', {
    externalId: normalizedExternalId,
    currency,
  })
  const data = payload?.data ?? payload
  const collectStatus = data.collectStatus || 'unknown'
  log(`getCollectStatus: externalId=${normalizedExternalId} -> collectStatus=${collectStatus}`)
  return { collectStatus, raw: payload }
}
