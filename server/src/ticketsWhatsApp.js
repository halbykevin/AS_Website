// The tickets on WhatsApp. When a booking is paid — online, in cash at the
// shop, or at the counter — its customer gets a WhatsApp message with the
// tickets PDF attached and a button to their booking page.
//
// A business can only start a WhatsApp conversation with an approved template,
// so the message is one: a UTILITY template whose header is the PDF. It is
// defined here once (ticketsTemplateDefinition), and that definition is what
// `npm run whatsapp:tickets-template` submits to Meta — so the parameters
// sent below can never drift from the template Meta approved.
//
// Sending is off until WHATSAPP_TICKETS_TEMPLATE names the approved template
// (and WHATSAPP_TOKEN / WHATSAPP_PHONE_ID are set). Like the emails it never
// holds up a payment: each attempt's outcome is recorded on the booking —
// whatsapp_status 'sent' (accepted by WhatsApp) or 'failed' with Meta's
// reason — and staff can send it again from the admin.

import { query } from './db.js'
import { bookingPdf } from './tickets.js'
import { ticketTime } from './ticketPdf.js'
import { sendTemplateMessage, uploadMedia, whatsappConnected } from './whatsapp.js'

const TEMPLATE = process.env.WHATSAPP_TICKETS_TEMPLATE || ''
const LANGUAGE = process.env.WHATSAPP_TICKETS_LANG || 'en'
const HUB_URL = (process.env.TICKETING_PUBLIC_URL || 'https://ticketing.as.com.lb').replace(/\/$/, '')

export const ticketsWhatsAppEnabled = () => whatsappConnected() && Boolean(TEMPLATE)

// {{1}} name · {{2}} event · {{3}} when · {{4}} where · {{5}} seats · {{6}} booking code
const BODY = [
  'Hi {{1}}, you’re in! Your tickets for {{2}} are confirmed.',
  '',
  '📅 {{3}}',
  '📍 {{4}}',
  '🎟️ {{5}}',
  '',
  'Booking code: {{6}}. Your tickets are attached — show one QR code per person at the entrance, on your phone or printed. See you there!',
].join('\n')
const FOOTER = 'AS Ticketing · AS Company'
const BUTTON = 'View my tickets'

/** What `npm run whatsapp:tickets-template` submits to Meta for approval. */
export function ticketsTemplateDefinition({ headerHandle, name = TEMPLATE || 'tickets_confirmed' } = {}) {
  return {
    name,
    language: LANGUAGE,
    category: 'UTILITY',
    components: [
      { type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [headerHandle] } },
      {
        type: 'BODY',
        text: BODY,
        example: {
          body_text: [['Maria', 'Al Qarna Al Bayda', 'Saturday 26 December 2026, 6:30 PM', 'Milad Al Ghazal Center, Zgharta', 'VIP A1, A2', 'AS-7K3M9Q']],
        },
      },
      { type: 'FOOTER', text: FOOTER },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'URL', text: BUTTON, url: `${HUB_URL}/bookings/{{1}}`, example: [`${HUB_URL}/bookings/AS-7K3M9Q?t=sample`] }],
      },
    ],
  }
}

// A template parameter is one line, never empty, and not a novel.
const param = (value, max = 120) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return (text.length > max ? `${text.slice(0, max - 1)}…` : text) || '—'
}

/** "VIP A1, A2 · Regular B3 · 2 × Standing Floor" */
export function seatsLine(seats = [], zones = []) {
  const byTier = new Map()
  for (const s of seats) byTier.set(s.tier, [...(byTier.get(s.tier) || []), `${s.row}${s.num}`])
  return [
    ...[...byTier].map(([tier, list]) => `${tier} ${list.join(', ')}`),
    ...zones.map((z) => `${z.qty} × ${z.name}`),
  ].join(' · ')
}

/** "Saturday 26 December 2026, 6:30 PM" */
export function whenLine(date, time) {
  const iso = date instanceof Date ? date.toISOString().slice(0, 10) : String(date || '').slice(0, 10)
  let day = ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    // From parts: en-GB puts a comma after the weekday, and the time adds another.
    const parts = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).formatToParts(new Date(`${iso}T12:00:00Z`))
    day = ['weekday', 'day', 'month', 'year'].map((k) => parts.find((p) => p.type === k)?.value).join(' ')
  }
  return [day, ticketTime(time).en].filter(Boolean).join(', ')
}

/**
 * Send a paid booking its tickets on WhatsApp, and record how it went.
 * Resolves { skipped } when there is nothing to do; throws with Meta's reason
 * when sending failed (already recorded on the booking).
 */
export async function sendTicketsWhatsApp(bookingId) {
  if (!ticketsWhatsAppEnabled()) return { skipped: 'WhatsApp isn’t set up' }
  const { rows } = await query(
    `SELECT b.*, e.title, e.date, e.time, e.venue, e.city
       FROM ticket_bookings b JOIN events e ON e.id = b.event_id WHERE b.id = $1`,
    [bookingId],
  )
  const b = rows[0]
  if (!b || b.status !== 'paid') return { skipped: 'not paid' }
  if (!b.mobile) return { skipped: 'no mobile number' }

  try {
    const pdf = await bookingPdf(b.id)
    if (!pdf) throw new Error('This booking has no tickets to send')
    const media = await uploadMedia(pdf.buffer, pdf.filename, 'application/pdf')
    const sent = await sendTemplateMessage(b.mobile, {
      name: TEMPLATE,
      language: LANGUAGE,
      components: [
        { type: 'header', parameters: [{ type: 'document', document: { id: media, filename: pdf.filename } }] },
        {
          type: 'body',
          parameters: [
            param(b.full_name, 60),
            param(b.title, 100),
            param(whenLine(b.date, b.time)),
            param([b.venue, b.city].filter(Boolean).join(', ')),
            param(seatsLine(b.seats || [], b.zones || []), 300),
            param(b.code),
          ].map((text) => ({ type: 'text', text })),
        },
        // The button's URL ends in {{1}}: the booking's own page, token and all.
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: `${b.code}?t=${b.token}` }] },
      ],
    })
    await query(
      `UPDATE ticket_bookings SET whatsapp_status = 'sent', whatsapp_at = now(), whatsapp_error = '', whatsapp_message_id = $2
        WHERE id = $1`,
      [b.id, sent?.messages?.[0]?.id || null],
    )
    console.log(`[whatsapp] ${b.code}: tickets sent to +${b.mobile}`)
    return { sent: true }
  } catch (err) {
    const reason = String(err?.message || err).slice(0, 500)
    await query(
      `UPDATE ticket_bookings SET whatsapp_status = 'failed', whatsapp_at = now(), whatsapp_error = $2 WHERE id = $1`,
      [b.id, reason],
    ).catch(() => {})
    console.error(`[whatsapp] ${b.code}: tickets not sent — ${reason}`)
    throw err
  }
}
