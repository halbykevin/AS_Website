// Tickets — what a paid booking turns into: one per seat or standing place,
// each with its own number and a QR code for the door.
//
// A ticket is issued the moment its booking is paid (online, in cash, at the
// counter, or free) and not before: a reservation is a promise to pay, and a
// code that gets someone in must not exist before the money does. Cancelling
// a booking voids its tickets rather than deleting them, so the scanner at the
// door can tell "cancelled" from "never ours".
//
// The QR code says AST1:<serial>:<secret> and nothing else. The serial is the
// number printed on the ticket; the secret is random, stored beside it, and
// printed nowhere — it is what makes a code unforgeable, since a serial is in
// plain sight on every ticket and read out at a counter. Who holds a ticket,
// which seat it is and whether it is still good are looked up at the door, never
// read from the code: a ticket can be cancelled after it was printed, and only
// the database knows.
//
// Issuing is idempotent (ensureTickets) and also happens on first read, so a
// booking paid before tickets existed, or one whose issue failed, gets its
// tickets the first time anyone asks for them.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { pool, query } from './db.js'
import { numberedSeats, sanitizeLayout } from './seatLayout.js'
import { POSTER_MM, renderTickets } from './ticketPdf.js'

let sharp = null
try {
  sharp = (await import('sharp')).default
} catch {
  console.warn('[tickets] sharp not installed — tickets print without the event picture')
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'))
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, '')
const HUB_HOST = new URL(process.env.TICKETING_PUBLIC_URL || 'https://ticketing.as.com.lb').host

// The booking codes' alphabet (no 0/O, 1/I/L) — a serial is read aloud too.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const randomChars = (n) => Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('')
const newSerial = () => `AST-${randomChars(8)}`
// ~79 bits. Upper case and digits only, so the whole code fits QR's compact
// alphanumeric mode and stays a coarse, easily scanned version 2.
const newSecret = () => randomChars(16)

export const qrText = (t) => `AST1:${t.serial}:${t.secret}`
const QR_FORMAT = /^AST1:(AST-[A-Z0-9]{8}):([A-Z0-9]{16})$/

// ------------------------------------------------------------- issuing ---

/**
 * Make sure a paid booking has its tickets: issue them the first time, and
 * bring back voided ones if a cancelled booking was paid after all. A seat gets
 * a ticket only while the booking holds it — a seat someone else took after a
 * reservation lapsed is the booking's needs_attention, not a second ticket for
 * one chair. Does nothing for a booking that isn't paid.
 */
export async function ensureTickets(bookingId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT * FROM ticket_bookings WHERE id = $1 FOR UPDATE', [bookingId])
    const b = rows[0]
    if (!b || b.status !== 'paid') {
      await client.query('ROLLBACK')
      return
    }
    const held = (await client.query('SELECT seat_id FROM ticket_booking_seats WHERE booking_id = $1', [b.id])).rows.map(
      (r) => r.seat_id,
    )
    const issued = await client.query('SELECT 1 FROM tickets WHERE booking_id = $1 LIMIT 1', [b.id])
    if (issued.rows[0]) {
      await client.query(
        `UPDATE tickets SET status = 'valid', voided_at = NULL
          WHERE booking_id = $1 AND status = 'void' AND (seat_id IS NULL OR seat_id = ANY($2::text[]))`,
        [b.id, held],
      )
    } else {
      const holding = new Set(held)
      const rows = [
        ...(b.seats || [])
          .filter((s) => holding.has(s.id))
          .map((s) => ({ seat: s.id, zone: null, section: s.tier, row: s.row, num: s.num, price: s.price })),
        ...(b.zones || []).flatMap((z) =>
          Array.from({ length: Number(z.qty) || 0 }, () => ({ seat: null, zone: z.id, section: z.name, row: '', num: '', price: z.price })),
        ),
      ]
      const serials = await freshSerials(client, rows.length)
      for (const [i, t] of rows.entries()) {
        await client.query(
          `INSERT INTO tickets (serial, secret, booking_id, event_id, seat_id, zone_id, section, row_label, seat_num, price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [serials[i], newSecret(), b.id, b.event_id, t.seat, t.zone, t.section || '', t.row || '', t.num || '', Number(t.price) || 0],
        )
      }
      if (rows.length) console.log(`[tickets] ${b.code}: issued ${rows.length} ticket(s)`)
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

async function freshSerials(client, n) {
  const out = new Set()
  while (out.size < n) {
    const batch = Array.from({ length: n - out.size }, newSerial).filter((s) => !out.has(s))
    const clash = await client.query('SELECT serial FROM tickets WHERE serial = ANY($1::text[])', [batch])
    const taken = new Set(clash.rows.map((r) => r.serial))
    for (const s of batch) if (!taken.has(s)) out.add(s)
  }
  return [...out]
}

/** Every paid booking of an event with its tickets issued — what the door's guest list needs. */
export async function ensureEventTickets(eventId) {
  const { rows } = await query(
    `SELECT b.id FROM ticket_bookings b
      WHERE b.event_id = $1 AND b.status = 'paid' AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.booking_id = b.id)`,
    [eventId],
  )
  for (const r of rows) await ensureTickets(r.id)
}

/** A cancelled booking's tickets stop working — and say so when scanned. */
export const voidTickets = (bookingId) =>
  query(`UPDATE tickets SET status = 'void', voided_at = now() WHERE booking_id = $1 AND status = 'valid'`, [bookingId])

const validTickets = async (bookingId) =>
  (await query(`SELECT * FROM tickets WHERE booking_id = $1 AND status = 'valid' ORDER BY id`, [bookingId])).rows

/** A paid booking's tickets for its owner's page: what each one is, and its QR code as SVG. */
export async function ticketCards(bookingId) {
  await ensureTickets(bookingId)
  return Promise.all(
    (await validTickets(bookingId)).map(async (t) => ({
      serial: t.serial,
      section: t.section,
      row: t.row_label,
      seat: t.seat_num,
      standing: !t.seat_id,
      qr: await QRCode.toString(qrText(t), { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }),
    })),
  )
}

// ---------------------------------------------------------- the door ---

const TICKET_ROW = `SELECT t.*, b.code AS booking_code, b.full_name, b.mobile, b.status AS booking_status, b.payment_method,
            b.channel, b.paid_at, e.title, e.slug, e.date, e.time, e.venue, e.city
       FROM tickets t JOIN ticket_bookings b ON b.id = t.booking_id JOIN events e ON e.id = t.event_id`

/** The ticket a scanned QR code belongs to — or null for anything we didn't issue. */
export async function ticketFromCode(code) {
  const m = QR_FORMAT.exec(String(code || '').trim())
  if (!m) return null
  const t = (await query(`${TICKET_ROW} WHERE t.serial = $1`, [m[1]])).rows[0]
  const a = Buffer.from(m[2])
  const b = Buffer.from(t?.secret || '')
  return t && a.length === b.length && crypto.timingSafeEqual(a, b) ? t : null
}

/**
 * The ticket with this printed number ("AST-K7M3Q9XP", or just "K7M3Q9XP") —
 * for a QR code that won't scan. Proves nothing on its own: the number is in
 * plain sight on the ticket, so whoever admits on it checks the holder.
 */
export async function ticketFromSerial(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '')
  const serial = /^AST-/.test(s) ? s : `AST-${s}`
  if (!/^AST-[A-Z0-9]{8}$/.test(serial)) return null
  return (await query(`${TICKET_ROW} WHERE t.serial = $1`, [serial])).rows[0] || null
}

/** Good at the door: issued, not voided, its booking still paid. */
export const ticketIsValid = (t) => t.status === 'valid' && t.booking_status === 'paid'

/** A ticket as the door and the admin see it. */
export function ticketJson(t) {
  return {
    serial: t.serial,
    status: t.status,
    voidedAt: t.voided_at,
    section: t.section,
    row: t.row_label,
    seat: t.seat_num,
    standing: !t.seat_id,
    label: t.seat_id ? `Row ${t.row_label} · Seat ${t.seat_num}` : t.section,
    price: Number(t.price),
    holder: t.full_name,
    mobile: t.mobile,
    bookingCode: t.booking_code,
    paymentMethod: t.payment_method,
    channel: t.channel,
    paidAt: t.paid_at,
    checkedInAt: t.checked_in_at,
    checkedInGate: t.checked_in_gate || '',
    event: { id: t.event_id, title: t.title, slug: t.slug, date: t.date, time: t.time, venue: t.venue, city: t.city },
  }
}

/**
 * What a scanned code is: { result: 'valid' | 'void' | 'unknown', ticket? }.
 * 'unknown' covers anything we didn't issue — a stranger's QR code, a typo, a
 * forged serial — and says nothing more, so it can't be used to probe serials.
 * Read-only: admitting someone is the door's step (door.js).
 */
export async function verifyTicket(code) {
  const t = await ticketFromCode(code)
  if (!t) return { result: 'unknown' }
  return { result: ticketIsValid(t) ? 'valid' : 'void', ticket: ticketJson(t) }
}

// ------------------------------------------------- the ticket's design ---

/**
 * An event's own touches on its ticket, set in the admin: the picture in the
 * left panel (empty = the event's picture) and the venue's name in Arabic.
 */
export function ticketDesign(input) {
  const src = input && typeof input === 'object' ? input : {}
  const url = String(src.imageUrl || '').trim().slice(0, 500)
  return {
    imageUrl: /^https?:\/\/\S+$/i.test(url) ? url : '',
    venueAr: String(src.venueAr || '').replace(/\s+/g, ' ').trim().slice(0, 60),
  }
}

// Pictures are cropped to the panel once and kept a while: a ten-ticket email
// and the reprint after it shouldn't fetch and resize the same poster again.
const posters = new Map()
const POSTER_PX = { w: Math.round((POSTER_MM.w / 25.4) * 300), h: Math.round((POSTER_MM.h / 25.4) * 300) }

async function imageBytes(url) {
  // Our own uploads are read from disk, not over the network.
  if (url.startsWith(`${PUBLIC_URL}/uploads/`)) {
    return fs.readFile(path.join(UPLOAD_DIR, path.basename(new URL(url).pathname)))
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > 15 * 1024 * 1024) throw new Error('image too large')
  return bytes
}

function poster(url) {
  if (!url || !sharp) return Promise.resolve(null)
  const hit = posters.get(url)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.promise
  const promise = imageBytes(url)
    .then((bytes) =>
      sharp(bytes).rotate().resize(POSTER_PX.w, POSTER_PX.h, { fit: 'cover' }).flatten({ background: '#1C1C1C' }).jpeg({ quality: 85 }).toBuffer(),
    )
    .catch((err) => {
      console.warn(`[tickets] couldn't use ${url} on the ticket:`, err?.message || err)
      return null
    })
  posters.set(url, { at: Date.now(), promise })
  if (posters.size > 30) posters.delete(posters.keys().next().value)
  return promise
}

async function eventForTicket(eventId, design) {
  const { rows } = await query(
    `SELECT e.title, e.date, e.time, e.venue, e.city, e.image_url, m.ticket
       FROM events e LEFT JOIN event_seatmaps m ON m.event_id = e.id WHERE e.id = $1`,
    [eventId],
  )
  const e = rows[0]
  if (!e) return null
  const d = design || ticketDesign(e.ticket)
  return {
    title: e.title,
    date: e.date,
    time: e.time,
    venue: e.venue,
    city: e.city,
    venueAr: d.venueAr,
    poster: await poster(d.imageUrl || e.image_url),
  }
}

/** A paid booking's tickets as one PDF — { filename, buffer } — or null if it has none. */
export async function bookingPdf(bookingId) {
  await ensureTickets(bookingId)
  const { rows } = await query(`SELECT code, full_name, event_id FROM ticket_bookings WHERE id = $1 AND status = 'paid'`, [
    bookingId,
  ])
  const b = rows[0]
  const tickets = b ? await validTickets(bookingId) : []
  if (!tickets.length) return null
  const event = await eventForTicket(b.event_id)
  const buffer = await renderTickets({
    event,
    website: HUB_HOST,
    tickets: tickets.map((t) => ({
      serial: t.serial,
      qr: qrText(t),
      holder: b.full_name,
      section: t.section,
      row: t.row_label,
      seat: t.seat_num,
      standing: !t.seat_id,
    })),
  })
  return { filename: `AS-Tickets-${b.code}.pdf`, buffer }
}

/**
 * A sample ticket for the admin to check the design — the hall's first seat
 * and the design as it stands on screen, saved or not. Watermarked, and its
 * QR code isn't in the AST1 format, so it can never scan as a ticket.
 */
export async function previewPdf(eventId, design) {
  const event = await eventForTicket(eventId, ticketDesign(design))
  if (!event) return null
  const map = await query('SELECT layout FROM event_seatmaps WHERE event_id = $1', [eventId])
  const layout = sanitizeLayout(map.rows[0]?.layout)
  const seat = numberedSeats(layout)[0]
  const area = layout.areas.find((a) => a.kind === 'standing')
  const tier = (id) => layout.tiers.find((t) => t.id === id)?.name || ''
  const sample = seat
    ? { section: tier(seat.tier), row: seat.row, seat: seat.num, standing: false }
    : area
      ? { section: area.label, standing: true }
      : { section: 'A', row: '1', seat: '1', standing: false }
  const buffer = await renderTickets({
    event,
    website: HUB_HOST,
    sample: true,
    tickets: [{ ...sample, serial: 'AST-SAMPLE00', qr: 'AS TICKETING SAMPLE - NOT A TICKET', holder: 'Sample Name' }],
  })
  return { filename: 'ticket-preview.pdf', buffer }
}
