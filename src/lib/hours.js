// The shop's opening hours — reading, wording and structured data.
//
// The week is kept once, in the AS Store's settings (store admin -> Settings ->
// Opening hours), and reaches this site through the site API's /api/shop
// (content.shop.hours): one key per day, ["HH:MM","HH:MM"] when open, null when
// closed. This module turns it into the sentence the FAQ says, the lines the
// contact page lists, and the openingHoursSpecification in the JSON-LD.
//
// A deliberate copy of as_store/src/lib/hours.js (and as_ticketing's): three
// sites stating one shop's hours must word them identically — change one,
// change all three. Pure: no imports, safe at build time and in the browser.

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const DAY_NAMES = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const validSpan = (v) => Array.isArray(v) && v.length === 2 && HHMM.test(v[0]) && HHMM.test(v[1]) && v[0] < v[1]

/** The week, cleaned: every day present, invalid days closed. null if no day is open. */
export function normalizeHours(raw) {
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  let any = false
  for (const d of DAYS) {
    out[d] = validSpan(raw[d]) ? [raw[d][0], raw[d][1]] : null
    if (out[d]) any = true
  }
  return any ? out : null
}

/** '09:00' -> '9:00 AM', '17:00' -> '5:00 PM'. */
export function formatTime(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/**
 * Consecutive days with the same hours, in week order:
 * [{ days: ['mon'…'fri'], span: ['09:00','17:00'] }, { days: ['sun'], span: null }].
 */
export function hoursGroups(raw) {
  const week = normalizeHours(raw)
  if (!week) return []
  const groups = []
  for (const d of DAYS) {
    const span = week[d]
    const last = groups[groups.length - 1]
    const same = last && (last.span === span || (last.span && span && last.span[0] === span[0] && last.span[1] === span[1]))
    if (same) last.days.push(d)
    else groups.push({ days: [d], span })
  }
  return groups
}

const dayRange = (days) =>
  days.length === 1
    ? DAY_NAMES[days[0]]
    : days.length === 2
      ? `${DAY_NAMES[days[0]]} and ${DAY_NAMES[days[1]]}`
      : `${DAY_NAMES[days[0]]} to ${DAY_NAMES[days[days.length - 1]]}`

const spanText = (span) => `${formatTime(span[0])} to ${formatTime(span[1])}`

/** One line per group: [{ label: 'Monday to Friday', value: '9:00 AM to 5:00 PM' | 'Closed' }]. */
export function hoursLines(raw) {
  return hoursGroups(raw).map((g) => ({ label: dayRange(g.days), value: g.span ? spanText(g.span) : 'Closed' }))
}

/**
 * The week as one sentence:
 * "Monday to Friday 9:00 AM to 5:00 PM, and Saturday 9:00 AM to 2:00 PM. Closed on Sunday."
 */
export function hoursSentence(raw) {
  const groups = hoursGroups(raw)
  if (!groups.length) return ''
  const open = groups.filter((g) => g.span).map((g) => `${dayRange(g.days)} ${spanText(g.span)}`)
  const closedDays = groups.filter((g) => !g.span).flatMap((g) => g.days)
  const list = open.length > 1 ? `${open.slice(0, -1).join(', ')}, and ${open[open.length - 1]}` : open[0]
  const closed = closedDays.length
    ? ` Closed on ${closedDays.length > 1 ? `${closedDays.slice(0, -1).map((d) => DAY_NAMES[d]).join(', ')} and ${DAY_NAMES[closedDays[closedDays.length - 1]]}` : DAY_NAMES[closedDays[0]]}.`
    : ''
  return `${list}.${closed}`
}

/** schema.org openingHoursSpecification — open days only; a day not listed is closed. */
export function openingHoursJsonLd(raw) {
  return hoursGroups(raw)
    .filter((g) => g.span)
    .map((g) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: g.days.map((d) => `https://schema.org/${DAY_NAMES[d]}`),
      opens: g.span[0],
      closes: g.span[1],
    }))
}
