// Helpers for the seat picker.
//
// Deliberately NOT in lib/events.js: that file is a byte-for-byte mirror of the
// marketing site's helpers and has to stay that way. The seat picker exists
// only here — as.com.lb/events redirects to this platform — so its message
// builder lives on its own rather than putting a function in the mirror that
// the other side would never have.

import { formatDate } from './events.js'

/** Where the live hall comes from — the marketing site's API, same as everything else. */
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export function seatmapUrl(slug, date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : ''
  return `${API}/api/events/${encodeURIComponent(slug)}/seatmap${q}`
}

/** Only box-office events have a hall we can read. Saves a request on the rest. */
export function hasSeatmap(event) {
  const urls = [event?.ticketUrl, ...(event?.dates || []).map((d) => d?.url)].filter(Boolean)
  return urls.some((u) => /(^|\.)ticketingboxoffice\.com$/i.test(hostOf(u)))
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export const money = (amount, currency = 'USD') => {
  const n = Number(amount) || 0
  const value = Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2)
  return currency === 'USD' ? `$${value}` : `${value} ${currency}`
}

/**
 * Some halls label a seat with something that isn't a number — a lounge sells
 * a place at a table and calls every one of them "XXX". Numbering that would
 * invent detail the box office never gave us.
 */
export const isNumberedSeat = (num) => /\d/.test(String(num || ''))

/** "Salle — Row B" / "LOUNGES — L 1" / "Row B", whichever parts exist. */
export function seatPlace(seat) {
  return [seat.section, seat.row && `Row ${seat.row}`].filter(Boolean).join(' — ')
}

/**
 * The WhatsApp message: what they picked, what it comes to, and a question.
 *
 * Seats are grouped by their place so a family of four reads as one line, and
 * the totals are stated because the visitor has already seen them on screen —
 * a message that drops them makes the conversation start with "how much?".
 *
 * The wording asks whether the seats are still free. That is deliberate and it
 * is not a formality: nothing here holds a seat, so the reply has to be able to
 * be "that one just went, here is what's next to it".
 */
export function whatsappSeatsUrl(number, { event, date, seats = [], zones = [], currency = 'USD' }) {
  const digits = String(number || '').replace(/\D/g, '')
  if (!digits || (!seats.length && !zones.length)) return ''

  const where = [event?.venue, event?.city].filter(Boolean).join(', ')
  const lines = [
    "Hello 👋 I'd like to reserve these tickets:",
    '',
    event?.title && `🎫 ${event.title}`,
    date ? `📅 ${formatDate(date)}` : null,
    where && `📍 ${where}`,
    '',
  ].filter((l) => l !== null && l !== undefined && l !== false)

  // Seats, grouped by section + row.
  const groups = new Map()
  for (const s of seats) {
    const key = `${seatPlace(s)}|${s.price}`
    const g = groups.get(key) || { place: seatPlace(s), price: s.price, nums: [] }
    if (isNumberedSeat(s.num)) g.nums.push(s.num)
    else g.nums.push(null)
    groups.set(key, g)
  }
  for (const g of groups.values()) {
    const numbered = g.nums.filter(Boolean)
    const label = numbered.length
      ? `${numbered.length > 1 ? 'seats' : 'seat'} ${numbered.join(', ')}`
      : `${g.nums.length} ${g.nums.length > 1 ? 'places' : 'place'}`
    const each = g.nums.length > 1 ? ' each' : ''
    lines.push(`🪑 ${[g.place, label].filter(Boolean).join(', ')} — ${money(g.price, currency)}${each}`)
  }

  // Zones (halls with no numbered seats, or a block we couldn't draw).
  for (const z of zones) {
    lines.push(`🪑 ${z.qty} × ${z.name} — ${money(z.price, currency)}${z.qty > 1 ? ' each' : ''}`)
  }

  const total =
    seats.reduce((sum, s) => sum + (Number(s.price) || 0), 0) +
    zones.reduce((sum, z) => sum + (Number(z.price) || 0) * (Number(z.qty) || 0), 0)
  const count = seats.length + zones.reduce((n, z) => n + (Number(z.qty) || 0), 0)

  lines.push('')
  lines.push(`💵 Total: ${money(total, currency)} for ${count} ${count === 1 ? 'ticket' : 'tickets'}`)
  lines.push('')
  lines.push('Are these still available?')

  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join('\n'))}`
}
