// Event date/text helpers, and the reservation link.
//
// These are a deliberate copy of the marketing site's src/lib/api.js
// (formatDate / eventDateLabel / eventLastDate / isEventPast /
// whatsappBookingUrl). They must stay in step: a visitor who follows a link
// from as.com.lb and one who lands here directly have to be offered the same
// reservation, worded the same way, or the two properties look like two
// companies. If you change the WhatsApp message here, change it there too.

/** 'YYYY-MM-DD' -> 'Thursday 18 Jun 2026'. */
export function formatDate(date) {
  if (!date) return ''
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  })
}

/** Every day an event runs, earliest first. */
export function eventDays(ev) {
  const days = Array.isArray(ev?.dates) ? ev.dates.map((d) => d?.date).filter(Boolean).sort() : []
  if (days.length) return days
  return ev?.date ? [ev.date] : []
}

/** A weekday range for a multi-night run, a single day otherwise. */
export function eventDateLabel(ev) {
  const days = eventDays(ev)
  if (days.length > 1) {
    const start = formatDate(days[0])
    const end = formatDate(days[days.length - 1])
    return start && end ? `${start} - ${end}` : start || end
  }
  return formatDate(days[0])
}

export function eventLastDate(ev) {
  const days = eventDays(ev)
  return days.length ? days[days.length - 1] : ''
}

/** Undated events are never past — there is nothing to compare against. */
export function isEventPast(ev) {
  const last = eventLastDate(ev)
  if (!last) return false
  const d = new Date(`${last}T23:59:59`)
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now()
}

/**
 * A WhatsApp "click to chat" link, pre-filled with the event so the visitor
 * only has to hit send. Returns '' when no number is configured.
 *
 * The partner's link (`ticketUrl`) is deliberately NOT in the message. It is
 * typed out on the visitor's own phone, where it is one tap from buying from
 * the partner directly; the title, date and venue identify the event for our
 * staff, who have the partner's link in the admin.
 */
export function whatsappBookingUrl(number, event) {
  const digits = String(number || '').replace(/\D/g, '')
  if (!digits || !event) return ''
  const location = [event.venue, event.city].filter(Boolean).join(', ')
  const details = [
    event.title && `🎫 ${event.title}`,
    eventDateLabel(event) && `📅 ${eventDateLabel(event)}`,
    location && `📍 ${location}`,
  ].filter(Boolean)
  const message = [
    "Hello👋 I'd like more details about this event:",
    '',
    ...details,
    '',
    'Is it still available, and how can I reserve a spot?',
  ].join('\n')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

/**
 * The WhatsApp number reservations go to: the dedicated one when set (Site
 * Settings → Events), else the company's. Every place the hub names a number to
 * reserve on goes through here, so the button, the seat request, the FAQ and
 * the structured data can never point at two different phones.
 */
export function reservationNumber(settings) {
  return settings?.ticketingWhatsappNumber || settings?.whatsappNumber || ''
}

/**
 * What the "Reserve" button points at: our WhatsApp, or nothing.
 *
 * Never the partner's page — not even with no number configured. A visitor
 * sent to the site we list from has been handed to the competition; the page
 * says "contact us" instead.
 */
export function bookingUrl(event, whatsappNumber) {
  return whatsappBookingUrl(whatsappNumber, event)
}

/** The same chat, for one night of a run rather than the whole run. */
export function nightBookingUrl(event, night, whatsappNumber) {
  if (!night?.date) return ''
  return whatsappBookingUrl(whatsappNumber, { ...event, date: night.date, time: night.time, dates: [night] })
}
