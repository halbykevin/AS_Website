// Small formatting helpers shared across screens. Mirrors the web's `money`
// helper and the marketing site's event-date formatting.

export const money = (n) => `$${Number(n || 0).toLocaleString()}`

// Format an event date (YYYY-MM-DD) as "Thursday 18 Jun 2026".
export function formatEventDate(date) {
  if (!date) return ''
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

// Weekday range for multi-day events, single day otherwise (matches the web).
export function eventDateLabel(ev) {
  const days = Array.isArray(ev?.dates) ? ev.dates.map((d) => d?.date).filter(Boolean).sort() : []
  if (days.length > 1) {
    const start = formatEventDate(days[0])
    const end = formatEventDate(days[days.length - 1])
    return start && end ? `${start} – ${end}` : start || end
  }
  return formatEventDate(ev?.date)
}

// The last calendar day an event runs.
export function eventLastDate(ev) {
  if (!ev) return ''
  const days = Array.isArray(ev.dates) ? ev.dates.map((d) => d?.date).filter(Boolean).sort() : []
  if (days.length) return days[days.length - 1]
  return ev.date || ''
}

// True when an event's last day is already in the past.
export function isEventPast(ev) {
  const last = eventLastDate(ev)
  if (!last) return false
  const d = new Date(`${last}T23:59:59`)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() < Date.now()
}

// Order timestamp → readable date.
export function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Human label for an order status.
export const ORDER_STATUS_LABEL = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}
