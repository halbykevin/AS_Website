// The one way a seat-map source reaches a partner.
//
// Every request is anonymous, read-only, times out, and asks as a browser —
// all three sites vary their output for unknown clients. Nothing here follows a
// URL that did not come from the event row it is serving (see seatmap.js).

const TIMEOUT_MS = 12_000

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export async function fetchText(url, { headers = {}, method = 'GET', body = null } = {}) {
  const res = await fetch(url, {
    method,
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': UA, 'Accept-Language': 'en', ...headers },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

export async function fetchJson(url, options) {
  const text = await fetchText(url, options)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('bad JSON')
  }
}

/** "150.00 USD" -> { amount: 150, currency: 'USD' }; "0.00" -> amount 0. */
export function parseMoney(text) {
  const m = String(text ?? '').match(/(-?[\d.,]+)\s*([A-Za-z]{3})?/)
  if (!m) return { amount: 0, currency: '' }
  const amount = Number(String(m[1]).replace(/,/g, ''))
  return { amount: Number.isFinite(amount) ? amount : 0, currency: (m[2] || '').toUpperCase() }
}

/**
 * A colour we can hand to CSS.
 *
 * The sites are inconsistent about the leading hash — ihjoz writes `#800080ff`
 * on one event and `800080ff` on another — and a swatch with a bare hex string
 * in it renders as nothing at all, silently.
 */
export function cssColor(value) {
  const v = String(value || '').trim()
  if (!v) return ''
  if (/^[0-9a-f]{3,8}$/i.test(v)) return `#${v}`
  if (/^(#|rgba?\(|hsla?\()/i.test(v)) return v.replace(/\s+/g, '')
  return ''
}

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** The legend: one entry per price, with the colour the partner paints it. */
export function tiersFrom(items) {
  const byPrice = new Map()
  for (const it of items) {
    if (!it || it.gap) continue
    const t = byPrice.get(it.price) || { price: it.price, currency: it.currency || '', color: '', seats: 0, available: 0 }
    t.seats += it.seats ?? 1
    t.available += it.available ?? (it.free ? 1 : 0)
    // Sold seats are repainted grey by every one of these sites, so their
    // colour says nothing about the tier — only free ones are trusted.
    if (!t.color && it.color && (it.free ?? true)) t.color = it.color
    byPrice.set(it.price, t)
  }
  return [...byPrice.values()].sort((a, b) => b.price - a.price)
}
