// Ticket bookings for the events AS Company hosts.
//
// A visitor picks seats (or standing tickets) on the hub's seat map and books
// them: the seats are held for 24 hours as 'reserved', and paid either online
// (Whish, the same merchant account as store.as.com.lb) or in cash at AS
// Company, where staff mark the booking paid in the admin. A reservation that
// isn't paid in time expires and its seats go back on sale on their own.
// Staff can also sell seats in person at the counter, from the seat map in the
// admin: a booking that is paid the moment it is made.
//
// Paid, a booking gets its tickets (tickets.js): a PDF with a QR code per
// seat, emailed to the customer, sent on WhatsApp (ticketsWhatsApp.js) and on
// their booking page.
//
// Nobody can book a seat someone else holds — not even at the same instant.
// Every booking is made inside a transaction that locks the event's seat map
// row, and each seat it holds is a row in ticket_booking_seats whose primary
// key is (event, seat): the lock makes the second of two simultaneous bookings
// wait and then see the seat gone, and the key would refuse it even if the lock
// were ever lost. Standing areas are counted under the same lock.
//
// Paid means Whish said so. The browser coming back from the payment page
// proves nothing; every path that can mark a booking paid online — Whish's
// callback, the return redirect, the customer's page, the expiry sweep — asks
// Whish for the payment's status first (the store's rule, see as_store whish).

import crypto from 'node:crypto'
import express from 'express'
import { pool, query } from './db.js'
import { NO_HOLDS, sanitizeLayout, seatIndex, zoneLeft } from './seatLayout.js'
import { createPayment, getCollectStatus, whishEnabled } from './whish.js'
import { sendBookingEmail, sendBookingStaffEmail } from './mailer.js'
import { bookingPdf, ensureTickets, previewPdf, ticketCards, verifyTicket, voidTickets } from './tickets.js'
import { sendTicketsWhatsApp, ticketsWhatsAppEnabled } from './ticketsWhatsApp.js'

export const HOLD_HOURS = 24
export const MAX_TICKETS = 10
// A school or a family buying at the shop counter can take more at once.
const MAX_COUNTER_TICKETS = 50
// Unpaid reservations one mobile number may have open on one event at once —
// enough for a family booking twice, not enough to sit on a hall for a day.
const MAX_OPEN_PER_MOBILE = 2
// Ticket payments share the store's Whish channel, where a store order's id is
// its externalId. Ours start here, far above any order id the store will reach,
// so a status check can never read a store order's payment as a ticket's.
const TICKET_EXT_BASE = 700_000_000
// A payment started near the end of the hold gets this long to finish before
// the sweep may release its seats.
const PAYMENT_GRACE = '1 hour'

const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, '')
const HUB_URL = (process.env.TICKETING_PUBLIC_URL || 'https://ticketing.as.com.lb').replace(/\/$/, '')
const ADMIN_URL = (process.env.ADMIN_PUBLIC_URL || 'https://www.as.com.lb').replace(/\/$/, '')

const isPublicHttps = (url) => /^https:\/\//.test(url) && !/localhost|127\.0\.0\.1/.test(url)
// Whish refuses callback and redirect URLs that aren't public HTTPS, so on a
// laptop "Buy now" is simply not offered — reserving still works.
export const onlinePaymentReady = () => whishEnabled() && isPublicHttps(PUBLIC_URL) && isPublicHttps(HUB_URL)

export const bookingsRouter = express.Router()
export const adminBookingsRouter = express.Router()

const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next)
const db = (client) => (text, params) => client.query(text, params)

// ------------------------------------------------------------------ input ---

// Same normaliser the store uses for a mobile: Lebanese numbers get 961.
export function normalizeMobile(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (!d.startsWith('961')) {
    if (d.startsWith('0')) d = d.slice(1)
    if (d.length >= 6 && d.length <= 8) d = `961${d}`
  }
  return d.length >= 9 && d.length <= 15 ? d : ''
}
const normalizeEmail = (raw) => {
  const e = String(raw || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e) && e.length <= 160 ? e : ''
}

// Codes are read aloud at a shop counter: no 0/O, 1/I/L.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function newCode() {
  const bytes = crypto.randomBytes(6)
  return `AS-${[...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')}`
}
const newToken = () => crypto.randomBytes(18).toString('base64url')
const sameToken = (a, b) => {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}

// A light per-IP throttle, like the contact form's: 6 bookings per 10 minutes.
const hits = new Map()
function throttled(ip) {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((t) => now - t < 600_000)
  if (recent.length >= 6) return true
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 1000) for (const [k, v] of hits) if (!v.some((t) => now - t < 600_000)) hits.delete(k)
  return false
}

// ------------------------------------------------------------ the holds ---

/**
 * What live bookings hold on an event: seat id -> 'reserved' | 'paid', and per
 * standing area how many tickets are reserved and paid. The seat-map routes
 * read it to grey seats out; a booking reads it under the lock.
 */
export async function liveHolds(eventId, run = query) {
  const [seats, zones] = await Promise.all([
    run(
      `SELECT s.seat_id, b.status FROM ticket_booking_seats s
         JOIN ticket_bookings b ON b.id = s.booking_id WHERE s.event_id = $1`,
      [eventId],
    ),
    run(
      `SELECT zones, status FROM ticket_bookings
        WHERE event_id = $1 AND status IN ('reserved', 'paid') AND zones <> '[]'::jsonb`,
      [eventId],
    ),
  ])
  const holds = { seats: new Map(), zones: new Map() }
  for (const r of seats.rows) holds.seats.set(r.seat_id, r.status === 'paid' ? 'paid' : 'reserved')
  for (const r of zones.rows) {
    for (const z of r.zones || []) {
      const cur = holds.zones.get(z.id) || { reserved: 0, paid: 0 }
      cur[r.status === 'paid' ? 'paid' : 'reserved'] += Number(z.qty) || 0
      holds.zones.set(z.id, cur)
    }
  }
  return holds
}

/**
 * Release every reservation whose 24 hours are up (one event's, or all) —
 * except one whose online payment started within the grace period, which may
 * still be about to succeed. Cheap enough to run before every availability
 * read, so a released seat is free the moment its time is up, not at the next
 * sweep. The customer is emailed by the sweep (notifyExpired).
 */
export async function expireBookings(run = query, eventId = null) {
  const { rows } = await run(
    `UPDATE ticket_bookings SET status = 'expired'
      WHERE status = 'reserved' AND expires_at < now()
        AND (whish_started_at IS NULL OR whish_started_at < now() - interval '${PAYMENT_GRACE}')
        ${eventId ? 'AND event_id = $1' : ''}
      RETURNING id`,
    eventId ? [eventId] : [],
  )
  if (rows.length) {
    await run('DELETE FROM ticket_booking_seats WHERE booking_id = ANY($1::int[])', [rows.map((r) => r.id)])
  }
  return rows.length
}

/**
 * The online booking fee per ticket, from Site Settings (default $1, 0 = off).
 * Charged on bookings made on the hub, for tickets that cost something and are
 * priced in USD — never at the counter, and a free booking stays free.
 */
export async function feePerTicket(run = query) {
  const { rows } = await run('SELECT booking_fee FROM settings WHERE id = 1')
  const fee = Number(rows[0]?.booking_fee)
  return Number.isFinite(fee) && fee > 0 ? fee : 0
}

// ------------------------------------------------------------- shaping ---

async function loadBooking(where, params) {
  const { rows } = await query(
    `SELECT b.*, e.title AS event_title, e.slug AS event_slug, e.date AS event_date, e.time AS event_time,
            e.venue AS event_venue, e.city AS event_city
       FROM ticket_bookings b JOIN events e ON e.id = b.event_id WHERE ${where}`,
    params,
  )
  return rows[0] || null
}

export const bookingLink = (b) => `${HUB_URL}/bookings/${b.code}?t=${encodeURIComponent(b.token)}`

/** The customer's view of a booking. */
function bookingJson(b) {
  return {
    code: b.code,
    status: b.status,
    paymentMethod: b.payment_method,
    name: b.full_name,
    mobile: b.mobile,
    email: b.email,
    seats: b.seats || [],
    zones: b.zones || [],
    quantity: b.quantity,
    // The booking fee this booking was charged — already inside `total`.
    fees: Number(b.fees || 0),
    total: Number(b.total),
    currency: b.currency,
    expiresAt: b.expires_at,
    paidAt: b.paid_at,
    createdAt: b.created_at,
    canPayOnline: b.status === 'reserved' && Number(b.total) > 0 && onlinePaymentReady(),
    holdHours: HOLD_HOURS,
    event: {
      title: b.event_title,
      slug: b.event_slug,
      date: b.event_date,
      time: b.event_time,
      venue: b.event_venue,
      city: b.event_city,
    },
  }
}

/** The admin's view: the customer's plus what staff need to act on it. */
const adminBookingJson = (b) => ({
  ...bookingJson(b),
  id: b.id,
  eventId: b.event_id,
  needsAttention: b.needs_attention || '',
  cancelledAt: b.cancelled_at,
  onlineStarted: Boolean(b.whish_started_at),
  channel: b.channel || 'online',
  whatsapp: { status: b.whatsapp_status || '', at: b.whatsapp_at, error: b.whatsapp_error || '' },
})

const forEmail = (b) => ({
  ...bookingJson(b),
  link: bookingLink(b),
  eventLink: `${HUB_URL}/events/${b.event_slug}`,
  adminLink: `${ADMIN_URL}/admin/events/${b.event_id}/seatmap`,
})

// The shop's address and hours for the "pay in cash" line, from the store
// admin (the site API's /api/shop relay). Set by app.js, which owns the relay.
let getShop = async () => null
export function setShopSource(fn) {
  getShop = fn
}

// The tickets ride along with the "paid" email. If they can't be drawn, the
// email still goes — its link leads to the booking page, which shows them.
const ticketAttachment = (b) =>
  bookingPdf(b.id)
    .then((pdf) => (pdf ? [{ filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' }] : []))
    .catch((e) => {
      console.error(`[bookings] ${b.code}: tickets PDF for the email:`, e?.message || e)
      return []
    })

// The numbers a customer can ask on: Site Settings' ticketing reservations
// WhatsApp and the company's — the ones every page of the site offers.
const contacts = () =>
  query('SELECT whatsapp_number, ticketing_whatsapp_number FROM settings WHERE id = 1')
    .then(({ rows }) => ({ ticketing: rows[0]?.ticketing_whatsapp_number || '', company: rows[0]?.whatsapp_number || '' }))
    .catch(() => null)

function mail(kind, b, { staff = false } = {}) {
  const payload = forEmail(b)
  Promise.all([getShop().catch(() => null), kind === 'paid' ? ticketAttachment(b) : [], contacts()])
    .then(([shop, attachments, who]) => sendBookingEmail(kind, { ...payload, contacts: who }, shop, attachments))
    .catch((e) => console.error(`[bookings] ${kind} email for ${b.code}:`, e?.message || e))
  if (staff) {
    sendBookingStaffEmail(kind, payload).catch((e) =>
      console.error(`[bookings] staff ${kind} email for ${b.code}:`, e?.message || e),
    )
  }
}

// …and on WhatsApp, once paid. Never awaited: the outcome is logged and kept
// on the booking, where staff see it and can send again.
function whatsappTickets(b) {
  if (ticketsWhatsAppEnabled() && b.mobile) sendTicketsWhatsApp(b.id).catch(() => {})
}

// ----------------------------------------------------------- payments ---

async function startOnlinePayment(b) {
  if (b.whish_collect_url) return b.whish_collect_url // resume the page already made
  const ext = TICKET_EXT_BASE + b.id
  const back = (result) => `${PUBLIC_URL}/api/bookings/whish/return?ext=${b.id}&result=${result}`
  const { collectUrl } = await createPayment({
    amount: Number(b.total),
    currency: b.currency,
    externalId: ext,
    invoice: `AS Ticketing ${b.code}`,
    successCallbackUrl: `${PUBLIC_URL}/api/bookings/whish/callback?ext=${b.id}`,
    failureCallbackUrl: `${PUBLIC_URL}/api/bookings/whish/callback?ext=${b.id}`,
    successRedirectUrl: back('success'),
    failureRedirectUrl: back('failure'),
  })
  await query(
    `UPDATE ticket_bookings SET whish_collect_url = $2, whish_started_at = now(), payment_method = 'whish'
      WHERE id = $1`,
    [b.id, collectUrl],
  )
  console.log(`[bookings] ${b.code}: online payment started (ext ${ext})`)
  return collectUrl
}

/**
 * Mark a booking paid — online (after Whish confirmed it) or in cash (staff).
 * Idempotent: a second call for a paid booking does nothing. A booking whose
 * hold had already lapsed takes its seats back if they are still free; if
 * someone else has them by now it is still paid (the money is real) but
 * flagged for staff to refund or re-seat.
 */
export async function markPaid(bookingId, method) {
  const client = await pool.connect()
  let paid = null
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT * FROM ticket_bookings WHERE id = $1 FOR UPDATE', [bookingId])
    const b = rows[0]
    if (!b || b.status === 'paid') {
      await client.query('ROLLBACK')
      return { changed: false, booking: b }
    }
    if (b.status === 'cancelled' && method !== 'whish') {
      await client.query('ROLLBACK')
      return { changed: false, booking: b, error: 'This booking was cancelled.' }
    }
    // Only a real problem is flagged: a late payment whose seats were still
    // free simply gets them back.
    const notes = []
    if (b.status === 'cancelled') notes.push('Paid online after it was cancelled — check with the customer')
    if (b.status !== 'reserved') {
      // Its seats were released when it expired (or was cancelled): claim them again.
      const map = await client.query('SELECT layout FROM event_seatmaps WHERE event_id = $1 FOR UPDATE', [b.event_id])
      const ids = (b.seats || []).map((s) => s.id)
      if (ids.length) {
        const got = await client.query(
          `INSERT INTO ticket_booking_seats (event_id, seat_id, booking_id)
           SELECT $1, unnest($2::text[]), $3 ON CONFLICT DO NOTHING RETURNING seat_id`,
          [b.event_id, ids, b.id],
        )
        const lost = (b.seats || []).filter((s) => !got.rows.some((r) => r.seat_id === s.id))
        if (lost.length) {
          notes.push(
            `Paid after its reservation lapsed, but seats ${lost.map((s) => `${s.row}${s.num}`).join(', ')} were re-booked by someone else — refund or re-seat`,
          )
        }
      }
      if ((b.zones || []).length && map.rows[0]) {
        const layout = sanitizeLayout(map.rows[0].layout)
        const holds = await liveHolds(b.event_id, db(client))
        const short = (b.zones || []).filter((z) => {
          const area = layout.areas.find((a) => a.id === z.id)
          return !area || zoneLeft(area, holds) < z.qty
        })
        if (short.length) {
          notes.push(`Paid after its reservation lapsed, but ${short.map((z) => z.name).join(', ')} no longer has room — refund or re-seat`)
        }
      }
    }
    const upd = await client.query(
      `UPDATE ticket_bookings SET status = 'paid', paid_at = now(), payment_method = $2,
              needs_attention = $3, cancelled_at = NULL
        WHERE id = $1 RETURNING *`,
      [b.id, method, notes.join('. ')],
    )
    await client.query('COMMIT')
    paid = upd.rows[0]
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  const full = await loadBooking('b.id = $1', [paid.id])
  console.log(`[bookings] ${full.code}: PAID (${method})${full.needs_attention ? ` — ${full.needs_attention}` : ''}`)
  // The payment stands whatever happens here; a failed issue is retried the
  // first time anyone asks for the tickets.
  await ensureTickets(full.id).catch((e) => console.error(`[bookings] ${full.code}: issuing tickets:`, e?.message || e))
  mail('paid', full, { staff: true })
  whatsappTickets(full)
  return { changed: true, booking: full }
}

/** Ask Whish whether an online payment went through, and record it if so. */
async function reconcile(b) {
  if (!b?.whish_started_at || b.status === 'paid' || !whishEnabled()) return b
  try {
    const { collectStatus } = await getCollectStatus({ externalId: TICKET_EXT_BASE + b.id, currency: b.currency })
    if (collectStatus === 'success') return (await markPaid(b.id, 'whish')).booking
  } catch (err) {
    console.error(`[bookings] ${b.code}: status check failed:`, err?.message || err)
  }
  return b
}

// ------------------------------------------------------------ booking ---

class Refusal extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

const seatLabel = (s) => `${s.row}${s.num}`

/**
 * Hold the requested seats and standing tickets for one customer, all or
 * nothing, under the event's lock. Prices come from the layout, never from
 * the request.
 *
 * `counter`: staff selling in person at AS Company. The booking is paid on the
 * spot, whether or not the hub's seat picking is on, and staff may sell a seat
 * they had marked sold or held by hand — that is how someone who bought at the
 * shop before tickets existed gets one. A seat a live booking holds is still
 * nobody else's to sell.
 */
async function createBooking(ev, input, { counter = false } = {}) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const map = await client.query(
      'SELECT layout, published FROM event_seatmaps WHERE event_id = $1 FOR UPDATE',
      [ev.id],
    )
    if (!map.rows[0]) throw new Refusal(409, 'This event has no seat map yet.')
    if (!counter && !map.rows[0].published) throw new Refusal(409, 'Online booking isn’t open for this event.')
    await expireBookings(db(client), ev.id)

    const layout = sanitizeLayout(map.rows[0].layout)
    const index = seatIndex(layout)
    const holds = await liveHolds(ev.id, db(client))

    const seats = []
    const taken = []
    for (const id of input.seats) {
      const s = index.get(id)
      if (!s) throw new Refusal(409, 'The seat map has changed — please pick your seats again.', { reload: true })
      if (holds.seats.has(id) || (!counter && s.status !== 'free')) taken.push(s)
      else seats.push({ id, row: s.row, num: s.num, tier: s.tierInfo.name, price: s.tierInfo.price })
    }
    if (taken.length) {
      const which = `${taken.length > 1 ? 'Seats' : 'Seat'} ${taken.map(seatLabel).join(', ')}`
      const were = taken.length > 1 ? 'were' : 'was'
      throw new Refusal(
        409,
        counter
          ? `${which} ${taken.length > 1 ? 'are' : 'is'} already booked — pick another.`
          : `${which} ${were} just taken by someone else — please pick another.`,
        { taken: taken.map((s) => s.id) },
      )
    }

    const zones = []
    for (const want of input.zones) {
      const area = layout.areas.find((a) => a.kind === 'standing' && a.id === want.id)
      if (!area) throw new Refusal(409, 'The seat map has changed — please choose again.', { reload: true })
      const left = zoneLeft(area, holds)
      if (want.qty > left) {
        // Places counted as sold by hand are already out of `left`: to print
        // tickets for them, staff lower that count on the map first.
        const byHand =
          counter && area.sold ? ` ${area.sold} are marked sold by hand — lower that on the map to print tickets for them.` : ''
        throw new Refusal(
          409,
          (left ? `Only ${left} ${area.label} ticket${left > 1 ? 's are' : ' is'} left.` : `${area.label} is sold out.`) + byHand,
          { reload: true },
        )
      }
      const tier = layout.tiers.find((t) => t.id === area.tier)
      zones.push({ id: area.id, name: area.label, qty: want.qty, price: tier.price })
    }

    if (!counter) {
      const open = await client.query(
        `SELECT count(*)::int AS n FROM ticket_bookings WHERE event_id = $1 AND mobile = $2 AND status = 'reserved'`,
        [ev.id, input.mobile],
      )
      if (open.rows[0].n >= MAX_OPEN_PER_MOBILE) {
        throw new Refusal(
          429,
          'This mobile number already has reservations waiting for payment for this event — pay or let one expire first.',
        )
      }
    }

    const tickets =
      Math.round(
        (seats.reduce((n, s) => n + s.price, 0) + zones.reduce((n, z) => n + z.price * z.qty, 0)) * 100,
      ) / 100
    const quantity = seats.length + zones.reduce((n, z) => n + z.qty, 0)
    const free = tickets === 0
    const paidNow = free || counter
    // The online booking fee, per ticket — inside the total, so what Whish or
    // the counter collects is exactly what the customer was shown.
    const fees =
      !counter && !free && layout.currency === 'USD'
        ? Math.round((await feePerTicket(db(client))) * quantity * 100) / 100
        : 0
    const total = Math.round((tickets + fees) * 100) / 100

    let code = newCode()
    for (let i = 0; i < 5; i++) {
      const clash = await client.query('SELECT 1 FROM ticket_bookings WHERE code = $1', [code])
      if (!clash.rows[0]) break
      code = newCode()
    }
    const ins = await client.query(
      `INSERT INTO ticket_bookings
         (code, token, event_id, full_name, mobile, email, seats, zones, quantity, total, currency,
          status, payment_method, expires_at, paid_at, ip, channel, fees)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now() + interval '${HOLD_HOURS} hours', $14, $15, $16, $17)
       RETURNING *`,
      [
        code, newToken(), ev.id, input.name, input.mobile, input.email,
        JSON.stringify(seats), JSON.stringify(zones), quantity, total, layout.currency,
        paidNow ? 'paid' : 'reserved', free ? 'free' : counter ? 'cash' : input.payment, paidNow ? new Date() : null,
        input.ip, counter ? 'counter' : 'online', fees,
      ],
    )
    const booking = ins.rows[0]
    if (seats.length) {
      // The lock already ruled these out being held; the key is the guarantee.
      await client.query(
        `INSERT INTO ticket_booking_seats (event_id, seat_id, booking_id) SELECT $1, unnest($2::text[]), $3`,
        [ev.id, seats.map((s) => s.id), booking.id],
      )
    }
    await client.query('COMMIT')
    return booking
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err?.code === '23505' && /ticket_booking_seats/.test(err?.constraint || err?.detail || '')) {
      throw new Refusal(409, 'One of those seats was just taken by someone else — please pick again.', { reload: true })
    }
    throw err
  } finally {
    client.release()
  }
}

/** What a request asks for: seat ids, and standing areas by quantity. */
function parsePicks(body) {
  const seats = [...new Set((Array.isArray(body.seats) ? body.seats : []).map((s) => String(s).slice(0, 16)))]
  const zoneQty = new Map()
  for (const z of Array.isArray(body.zones) ? body.zones : []) {
    const qty = Math.floor(Number(z?.qty))
    const id = String(z?.id || '').slice(0, 24)
    if (id && qty > 0) zoneQty.set(id, (zoneQty.get(id) || 0) + qty)
  }
  const zones = [...zoneQty].map(([id, qty]) => ({ id, qty }))
  return { seats, zones, count: seats.length + zones.reduce((n, z) => n + z.qty, 0) }
}

const cleanName = (raw) => String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 80)

function sendPdf(res, pdf) {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${pdf.filename}"`,
    'Cache-Control': 'no-store',
  })
  res.send(pdf.buffer)
}

// ------------------------------------------------------- public routes ---

// POST /api/events/:slug/bookings
//   { seats: [seatId], zones: [{ id, qty }], name, mobile, email, payment: 'cash' | 'whish' }
// -> 201 { code, token, status, link, collectUrl? }
bookingsRouter.post(
  '/events/:slug/bookings',
  ah(async (req, res) => {
    const b = req.body || {}
    if (String(b.website || '').trim()) return res.status(201).json({ ok: true }) // honeypot
    if (throttled(req.ip)) return res.status(429).json({ error: 'Too many bookings from here — please try again in a few minutes.' })

    // Name and mobile are required — the tickets go to that number on
    // WhatsApp. Email is optional: given, they go there too.
    const name = cleanName(b.name)
    const mobile = normalizeMobile(b.mobile)
    const email = String(b.email || '').trim() ? normalizeEmail(b.email) : ''
    if (name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' })
    if (!mobile) return res.status(400).json({ error: 'Please enter a valid mobile number.' })
    if (String(b.email || '').trim() && !email) {
      return res.status(400).json({ error: 'That email address doesn’t look right — fix it or leave it empty.' })
    }

    const { seats, zones, count } = parsePicks(b)
    if (!count) return res.status(400).json({ error: 'Pick at least one seat or ticket.' })
    if (count > MAX_TICKETS) return res.status(400).json({ error: `You can book up to ${MAX_TICKETS} tickets at a time.` })

    const { rows } = await query(
      `SELECT id, slug, title, date, dates FROM events WHERE slug = $1 AND published AND source = ''`,
      [req.params.slug],
    )
    const ev = rows[0]
    if (!ev) return res.status(404).json({ error: 'Event not found' })
    const days = [ev.date, ...(Array.isArray(ev.dates) ? ev.dates.map((d) => d?.date) : [])].filter(Boolean).sort()
    const last = days[days.length - 1]
    if (last && last < new Date().toISOString().slice(0, 10)) {
      return res.status(410).json({ error: 'This event has ended.' })
    }

    const payment = b.payment === 'whish' ? 'whish' : 'cash'
    let booking
    try {
      booking = await createBooking(ev, { seats, zones, name, mobile, email, payment, ip: String(req.ip || '') })
    } catch (err) {
      if (err instanceof Refusal) return res.status(err.status).json({ error: err.message, ...err.extra })
      throw err
    }

    const full = await loadBooking('b.id = $1', [booking.id])
    console.log(`[bookings] ${full.code}: ${full.status} — ${full.quantity} ticket(s), ${full.total} ${full.currency}, ${payment}`)
    if (full.status === 'paid') {
      await ensureTickets(full.id).catch((e) => console.error(`[bookings] ${full.code}: issuing tickets:`, e?.message || e))
      whatsappTickets(full)
    }
    mail(full.status === 'paid' ? 'paid' : 'reserved', full, { staff: true })

    let collectUrl = ''
    let onlineError = ''
    if (full.status === 'reserved' && payment === 'whish') {
      if (!onlinePaymentReady()) onlineError = 'Online payment isn’t available right now.'
      else {
        try {
          collectUrl = await startOnlinePayment(full)
        } catch (err) {
          console.error(`[bookings] ${full.code}: could not start online payment:`, err?.message || err)
          onlineError = 'We couldn’t open the online payment.'
        }
      }
    }
    res.status(201).json({
      code: full.code,
      token: full.token,
      status: full.status,
      link: bookingLink(full),
      collectUrl,
      onlineError,
    })
  }),
)

// Whish → us, server to server. Answers 200 whatever happens; the status
// check inside reconcile() is what decides.
bookingsRouter.get(
  '/bookings/whish/callback',
  ah(async (req, res) => {
    const b = await loadBooking('b.id = $1', [Number(req.query.ext) || 0])
    console.log(`[bookings] Whish callback for ${b?.code || `#${req.query.ext}`} (${req.query.result || '-'})`)
    if (b) await reconcile(b)
    res.json({ ok: true })
  }),
)

// The customer's browser coming back from Whish → their booking page.
bookingsRouter.get(
  '/bookings/whish/return',
  ah(async (req, res) => {
    const b = await loadBooking('b.id = $1', [Number(req.query.ext) || 0])
    if (!b) return res.redirect(`${HUB_URL}/events`)
    const fresh = await reconcile(b)
    const flag = fresh?.status === 'paid' ? 'paid=1' : 'failed=1'
    res.redirect(`${bookingLink(b)}&${flag}`)
  }),
)

async function bookingFor(req) {
  const b = await loadBooking('b.code = $1', [String(req.params.code || '').toUpperCase().slice(0, 16)])
  const token = req.query.t || req.body?.t
  return b && sameToken(token, b.token) ? b : null
}

// GET /api/bookings/:code?t=<token> — the customer's booking page.
bookingsRouter.get(
  '/bookings/:code',
  ah(async (req, res) => {
    let b = await bookingFor(req)
    if (!b) return res.status(404).json({ error: 'Booking not found' })
    if (b.status === 'reserved' && b.whish_started_at) b = (await reconcile(b)) || b
    if (b.status === 'reserved' && new Date(b.expires_at) < new Date()) {
      await expireBookings(query, b.event_id)
      b = await loadBooking('b.id = $1', [b.id])
    }
    res.set('Cache-Control', 'no-store')
    res.json({ ...bookingJson(b), tickets: b.status === 'paid' ? await ticketCards(b.id) : [] })
  }),
)

// GET /api/bookings/:code/tickets.pdf?t=<token> — a paid booking's tickets.
bookingsRouter.get(
  '/bookings/:code/tickets.pdf',
  ah(async (req, res) => {
    const b = await bookingFor(req)
    if (!b) return res.status(404).json({ error: 'Booking not found' })
    const pdf = b.status === 'paid' ? await bookingPdf(b.id) : null
    if (!pdf) return res.status(409).json({ error: 'Tickets are issued once a booking is paid.' })
    sendPdf(res, pdf)
  }),
)

// POST /api/bookings/:code/pay?t=<token> — pay a reservation online → { collectUrl }
bookingsRouter.post(
  '/bookings/:code/pay',
  ah(async (req, res) => {
    const b = await bookingFor(req)
    if (!b) return res.status(404).json({ error: 'Booking not found' })
    if (b.status === 'paid') return res.status(409).json({ error: 'This booking is already paid.' })
    if (b.status !== 'reserved' || new Date(b.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This reservation has expired — its seats were released.' })
    }
    if (!onlinePaymentReady()) return res.status(503).json({ error: 'Online payment isn’t available right now.' })
    try {
      res.json({ collectUrl: await startOnlinePayment(b) })
    } catch (err) {
      console.error(`[bookings] ${b.code}: could not start online payment:`, err?.message || err)
      res.status(502).json({ error: 'We couldn’t open the online payment. Please try again.' })
    }
  }),
)

// -------------------------------------------------------- admin routes ---
// Mounted behind requireAuth at /api/hosted-events.

adminBookingsRouter.get(
  '/:id/bookings',
  ah(async (req, res) => {
    await expireBookings(query, Number(req.params.id) || 0)
    const { rows } = await query(
      `SELECT b.*, e.title AS event_title, e.slug AS event_slug, e.date AS event_date, e.time AS event_time,
              e.venue AS event_venue, e.city AS event_city
         FROM ticket_bookings b JOIN events e ON e.id = b.event_id
        WHERE b.event_id = $1 ORDER BY b.created_at DESC`,
      [req.params.id],
    )
    res.json(rows.map(adminBookingJson))
  }),
)

// Cash received at AS Company.
adminBookingsRouter.post(
  '/bookings/:bid/paid',
  ah(async (req, res) => {
    const result = await markPaid(Number(req.params.bid) || 0, 'cash')
    if (!result.booking) return res.status(404).json({ error: 'Booking not found' })
    if (result.error) return res.status(409).json({ error: result.error })
    res.json(adminBookingJson(await loadBooking('b.id = $1', [result.booking.id])))
  }),
)

// Cancel: the seats go back on sale. A paid booking's refund is handled by hand.
adminBookingsRouter.post(
  '/bookings/:bid/cancel',
  ah(async (req, res) => {
    const { rows } = await query(
      `UPDATE ticket_bookings SET status = 'cancelled', cancelled_at = now()
        WHERE id = $1 AND status IN ('reserved', 'paid') RETURNING id`,
      [Number(req.params.bid) || 0],
    )
    if (!rows[0]) return res.status(409).json({ error: 'Only a reserved or paid booking can be cancelled.' })
    await query('DELETE FROM ticket_booking_seats WHERE booking_id = $1', [rows[0].id])
    await voidTickets(rows[0].id)
    const b = await loadBooking('b.id = $1', [rows[0].id])
    console.log(`[bookings] ${b.code}: cancelled by staff`)
    mail('cancelled', b)
    res.json(adminBookingJson(b))
  }),
)

adminBookingsRouter.post(
  '/bookings/:bid/resend',
  ah(async (req, res) => {
    const b = await loadBooking('b.id = $1', [Number(req.params.bid) || 0])
    if (!b) return res.status(404).json({ error: 'Booking not found' })
    const kind = { reserved: 'reserved', paid: 'paid', expired: 'expired', cancelled: 'cancelled' }[b.status]
    mail(kind, b)
    res.json({ ok: true })
  }),
)

// POST /api/hosted-events/:id/counter-sale
//   { seats: [seatId], zones: [{ id, qty }], name, mobile?, email? }
// Someone buying in person at AS Company: a booking paid in cash on the spot,
// its tickets issued at once for staff to print. Mobile and email are optional
// — given an email, the customer gets their tickets there too.
adminBookingsRouter.post(
  '/:id/counter-sale',
  ah(async (req, res) => {
    const b = req.body || {}
    const name = cleanName(b.name)
    const mobile = b.mobile ? normalizeMobile(b.mobile) : ''
    const email = b.email ? normalizeEmail(b.email) : ''
    if (name.length < 2) return res.status(400).json({ error: 'Enter the customer’s name — it is printed on the tickets.' })
    if (b.mobile && !mobile) return res.status(400).json({ error: 'That mobile number doesn’t look right — fix it or leave it empty.' })
    if (b.email && !email) return res.status(400).json({ error: 'That email doesn’t look right — fix it or leave it empty.' })

    const { seats, zones, count } = parsePicks(b)
    if (!count) return res.status(400).json({ error: 'Pick at least one seat or ticket.' })
    if (count > MAX_COUNTER_TICKETS) {
      return res.status(400).json({ error: `Up to ${MAX_COUNTER_TICKETS} tickets at a time — split a bigger order in two.` })
    }

    const { rows } = await query(`SELECT id, slug, title FROM events WHERE id = $1 AND source = ''`, [Number(req.params.id) || 0])
    if (!rows[0]) return res.status(404).json({ error: 'Event not found' })
    let booking
    try {
      booking = await createBooking(rows[0], { seats, zones, name, mobile, email, ip: '' }, { counter: true })
    } catch (err) {
      if (err instanceof Refusal) return res.status(err.status).json({ error: err.message, ...err.extra })
      throw err
    }
    await ensureTickets(booking.id)
    const full = await loadBooking('b.id = $1', [booking.id])
    console.log(`[bookings] ${full.code}: sold at the counter — ${full.quantity} ticket(s), ${full.total} ${full.currency}`)
    if (email) mail('paid', full)
    whatsappTickets(full)
    res.status(201).json(adminBookingJson(full))
  }),
)

// POST /api/hosted-events/bookings/:bid/whatsapp — send a paid booking its
// tickets on WhatsApp now (again, or for the first time). Waits for Meta's
// answer, so staff see a refusal — "not a WhatsApp number" — there and then.
adminBookingsRouter.post(
  '/bookings/:bid/whatsapp',
  ah(async (req, res) => {
    if (!ticketsWhatsAppEnabled()) return res.status(503).json({ error: 'WhatsApp isn’t set up on the server yet.' })
    const id = Number(req.params.bid) || 0
    try {
      const result = await sendTicketsWhatsApp(id)
      if (result.skipped) return res.status(409).json({ error: `Nothing sent — ${result.skipped}.` })
    } catch (err) {
      return res.status(502).json({ error: err?.message || 'WhatsApp didn’t take the message.' })
    }
    res.json(adminBookingJson(await loadBooking('b.id = $1', [id])))
  }),
)

// GET /api/hosted-events/bookings/:bid/tickets.pdf — to print or resend by hand.
adminBookingsRouter.get(
  '/bookings/:bid/tickets.pdf',
  ah(async (req, res) => {
    const pdf = await bookingPdf(Number(req.params.bid) || 0)
    if (!pdf) return res.status(409).json({ error: 'Only a paid booking has tickets.' })
    sendPdf(res, pdf)
  }),
)

// POST /api/hosted-events/:id/ticket-preview { ticket: { imageUrl, venueAr } }
// A watermarked sample, from the design on screen — saved or not.
adminBookingsRouter.post(
  '/:id/ticket-preview',
  ah(async (req, res) => {
    const pdf = await previewPdf(Number(req.params.id) || 0, req.body?.ticket)
    if (!pdf) return res.status(404).json({ error: 'Event not found' })
    sendPdf(res, pdf)
  }),
)

// POST /api/hosted-events/tickets/verify { code } — what a scanned QR code is:
// { result: 'valid' | 'void' | 'unknown', ticket? }. Read-only; the door
// portal builds admitting someone on top of it.
adminBookingsRouter.post(
  '/tickets/verify',
  ah(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await verifyTicket(req.body?.code))
  }),
)

// ---------------------------------------------------------- the sweep ---

let sweeping = false
async function sweep() {
  if (sweeping) return
  sweeping = true
  try {
    // A payment may have gone through without Whish's callback reaching us:
    // ask before letting its seats go.
    if (whishEnabled()) {
      const due = await query(
        `SELECT * FROM ticket_bookings
          WHERE status = 'reserved' AND whish_started_at IS NOT NULL AND expires_at < now() + interval '5 minutes'
          ORDER BY expires_at LIMIT 20`,
      )
      for (const b of due.rows) await reconcile(b)
    }
    await expireBookings()
    const expired = await query(
      `SELECT id FROM ticket_bookings WHERE status = 'expired' AND expiry_emailed_at IS NULL ORDER BY id LIMIT 50`,
    )
    for (const { id } of expired.rows) {
      await query('UPDATE ticket_bookings SET expiry_emailed_at = now() WHERE id = $1', [id])
      const b = await loadBooking('b.id = $1', [id])
      console.log(`[bookings] ${b.code}: expired unpaid — seats released`)
      mail('expired', b)
    }
  } catch (err) {
    console.error('[bookings] sweep failed:', err?.message || err)
  } finally {
    sweeping = false
  }
}

/** Every minute: release lapsed reservations and tell their customers. */
export function startBookingsSchedule() {
  setInterval(sweep, 60_000).unref()
  setTimeout(sweep, 5_000).unref()
  console.log(
    `[bookings] ${HOLD_HOURS}h holds, swept every minute — online payment ${
      onlinePaymentReady() ? 'ON (Whish)' : 'OFF (needs WHISH_* and public https PUBLIC_URL/TICKETING_PUBLIC_URL)'
    }`,
  )
}
