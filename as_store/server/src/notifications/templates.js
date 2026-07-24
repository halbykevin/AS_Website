// Template rendering for the notification domain. Pure functions — no DB —
// so they are unit-testable and reusable by both the service and previews.

export const CATEGORIES = ['order', 'promo', 'news', 'survey', 'account']

// Categories a customer cannot opt out of: they are required to complete or
// secure an order / account service.
export const TRANSACTIONAL = new Set(['order', 'account'])

export const CHANNELS = ['inapp', 'push', 'email']

// Replace {{var}} placeholders from `vars`; unknown placeholders render as ''.
// Values are stringified; no HTML is ever produced here (plain text only), so
// rendered output is safe for push payloads and inbox rows alike.
export function renderString(tpl, vars = {}) {
  return String(tpl || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    const v = vars[key]
    return v === undefined || v === null ? '' : String(v)
  })
}

// Pick the localized field with English fallback (Arabic copy is optional).
export function localized(row, field, locale = 'en') {
  if (locale === 'ar') {
    const ar = row[`${field}_ar`] ?? row[`${field}Ar`]
    if (ar && String(ar).trim()) return ar
  }
  return row[`${field}_en`] ?? row[`${field}En`] ?? row[field] ?? ''
}

// Render a template row (snake_case DB row or camelCase JSON) with vars into
// the final {title, body, deepLink} for one locale.
export function renderTemplate(row, vars = {}, locale = 'en') {
  return {
    title: renderString(localized(row, 'title', locale), vars),
    body: renderString(localized(row, 'body', locale), vars),
    deepLink: renderString(row.deep_link ?? row.deepLink ?? '', vars),
  }
}

// Deep links must be an in-app path ("/orders/12") or an https URL on an
// allowlisted host — never javascript:, data:, or an arbitrary domain.
export function safeDeepLink(link, allowedHosts = []) {
  const s = String(link || '').trim()
  if (!s) return ''
  if (s.startsWith('/') && !s.startsWith('//')) return s
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:') return ''
    const host = u.hostname.toLowerCase()
    return allowedHosts.some((h) => host === h || host.endsWith(`.${h}`)) ? s : ''
  } catch {
    return ''
  }
}

export const clampCategory = (c) => (CATEGORIES.includes(c) ? c : 'news')
export const clampPriority = (p) => (p === 'high' ? 'high' : 'normal')
export const clampChannels = (list) => {
  const arr = (Array.isArray(list) ? list : []).filter((c) => CHANNELS.includes(c))
  return arr.length ? [...new Set(arr)] : ['inapp']
}
