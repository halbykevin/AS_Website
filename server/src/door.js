// The door: scanning tickets as people come in (www.as.com.lb/door).
//
// Door staff never get the admin. Each event has its own door PIN, made in its
// seat map editor; a phone that enters it gets a door token for that one
// event, good until the PIN is changed, door access is turned off, or the event
// is over. Door tokens are signed with their own key, derived from JWT_SECRET,
// so a door token can never pass for an admin one — requireAuth checks only
// the signature — and an admin token can't open the door either.
//
// Online, admitting is one UPDATE that only succeeds while the ticket is valid
// and nobody has admitted it yet: two gates scanning the same screenshot at
// the same instant let one person in. Each phone also keeps the event's guest
// list, with every code as a SHA-256 fingerprint rather than the code itself
// (a lost phone can't print tickets), and when the signal drops it admits from
// that list, queues what it did, and syncs when it's back. Two offline gates
// can each admit the same copied ticket; the sync records the second as a
// conflict instead of hiding it.
//
// Every scan, whatever it found, is logged in ticket_scans.

import crypto from 'node:crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import QRCode from 'qrcode'
import { query } from './db.js'
import { ensureEventTickets, qrText, ticketFromCode, ticketFromSerial, ticketIsValid, ticketJson } from './tickets.js'

const DOOR_KEY = crypto
  .createHmac('sha256', process.env.JWT_SECRET || 'dev-secret-change-me')
  .update('as-ticketing-door')
  .digest()
const ADMIN_URL = (process.env.ADMIN_PUBLIC_URL || 'https://www.as.com.lb').replace(/\/$/, '')
export const DOOR_URL = `${ADMIN_URL}/door`
// A mistaken admit can be taken back for this long; after that it is history.
const UNDO_MINUTES = 15

export const doorRouter = express.Router()
export const adminDoorRouter = express.Router()

const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next)
const cleanGate = (raw) => String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 30)

// Six digits, read out to a volunteer at the door — and tried at most ten
// times an hour from one place (attempts below).
async function newPin() {
  for (;;) {
    const pin = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    const clash = await query('SELECT 1 FROM event_doors WHERE pin = $1 AND enabled', [pin])
    if (!clash.rows[0]) return pin
  }
}

/**
 * Door access ends the day after the event's last night (Beirut) — and lasts
 * at least 12 hours from when it is made or turned back on, so a door can
 * still be opened for an event whose date was entered wrong.
 */
async function doorExpiry(eventId) {
  const { rows } = await query('SELECT date, dates FROM events WHERE id = $1', [eventId])
  const e = rows[0]
  const days = [e?.date, ...(Array.isArray(e?.dates) ? e.dates.map((d) => d?.date) : [])]
    .map((d) => (d instanceof Date ? d.toISOString() : String(d || '')).slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
  const last = days[days.length - 1]
  // Midnight in Beirut (UTC+2/+3) after the day following the last night.
  const end = last ? Date.parse(`${last}T21:00:00Z`) + 2 * 86_400_000 : Date.now() + 7 * 86_400_000
  return new Date(Math.max(end, Date.now() + 12 * 3_600_000))
}

async function stats(eventId) {
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE checked_in_at IS NOT NULL)::int AS admitted, count(*)::int AS total
       FROM tickets WHERE event_id = $1 AND status = 'valid'`,
    [eventId],
  )
  return rows[0]
}

function logScan(eventId, { ticket = null, serial = '', result, gate = '', method = 'scan', at = null }) {
  return query(
    `INSERT INTO ticket_scans (event_id, ticket_id, serial, result, gate, method, scanned_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now()))`,
    [eventId, ticket?.id || null, ticket?.serial || String(serial).slice(0, 40), result, gate, method, at],
  ).catch((e) => console.error('[door] scan log failed:', e?.message || e))
}

// --------------------------------------------------------- door tokens ---

const doorAttempts = new Map()
function tooManyAttempts(ip) {
  const now = Date.now()
  const recent = (doorAttempts.get(ip) || []).filter((t) => now - t < 3_600_000)
  doorAttempts.set(ip, recent)
  if (doorAttempts.size > 1000) for (const [k, v] of doorAttempts) if (!v.some((t) => now - t < 3_600_000)) doorAttempts.delete(k)
  return recent.length >= 10
}

async function requireDoor(req, res, next) {
  const header = req.headers.authorization || ''
  let claims
  try {
    claims = jwt.verify(header.replace(/^Bearer /, ''), DOOR_KEY)
  } catch {
    return res.status(401).json({ error: 'Enter the door PIN again.', signedOut: true })
  }
  const { rows } = await query(
    `SELECT d.*, e.title, e.date, e.time, e.venue, e.city FROM event_doors d JOIN events e ON e.id = d.event_id
      WHERE d.event_id = $1`,
    [claims.door],
  )
  const door = rows[0]
  if (!door || !door.enabled || door.version !== claims.v || (door.expires_at && new Date(door.expires_at) < new Date())) {
    return res.status(401).json({ error: 'Door access for this event has changed — enter the new PIN.', signedOut: true })
  }
  req.door = { eventId: door.event_id, gate: cleanGate(claims.gate), event: eventCard(door) }
  next()
}

const eventCard = (e) => ({ id: e.event_id ?? e.id, title: e.title, date: e.date, time: e.time, venue: e.venue, city: e.city })

// POST /api/door/login { pin, gate } -> { token, event, gate, expiresAt, stats }
doorRouter.post(
  '/login',
  ah(async (req, res) => {
    if (tooManyAttempts(req.ip)) return res.status(429).json({ error: 'Too many tries — wait a while, or ask for the PIN again.' })
    const pin = String(req.body?.pin || '').replace(/\D/g, '')
    const gate = cleanGate(req.body?.gate)
    const { rows } = await query(
      `SELECT d.*, e.title, e.date, e.time, e.venue, e.city FROM event_doors d JOIN events e ON e.id = d.event_id
        WHERE d.pin = $1 AND d.enabled AND (d.expires_at IS NULL OR d.expires_at > now())`,
      [pin],
    )
    const door = rows[0]
    if (!door) {
      doorAttempts.get(req.ip).push(Date.now())
      return res.status(401).json({ error: 'That PIN isn’t right, or door access for its event is off.' })
    }
    const seconds = Math.max(3600, Math.floor((new Date(door.expires_at) - Date.now()) / 1000))
    const token = jwt.sign({ door: door.event_id, v: door.version, gate }, DOOR_KEY, { expiresIn: seconds })
    console.log(`[door] ${door.title}: door opened${gate ? ` at ${gate}` : ''}`)
    res.json({ token, gate, expiresAt: door.expires_at, event: eventCard(door), stats: await stats(door.event_id) })
  }),
)

doorRouter.use(ah(requireDoor))

doorRouter.get(
  '/state',
  ah(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ event: req.door.event, gate: req.door.gate, stats: await stats(req.door.eventId) })
  }),
)

// The guest list a phone keeps for when the signal drops. Codes go out as
// fingerprints only; the phone hashes what it scans and compares.
doorRouter.get(
  '/list',
  ah(async (req, res) => {
    await ensureEventTickets(req.door.eventId)
    const { rows } = await query(
      `SELECT t.*, b.full_name, b.status AS booking_status FROM tickets t JOIN ticket_bookings b ON b.id = t.booking_id
        WHERE t.event_id = $1 ORDER BY t.id`,
      [req.door.eventId],
    )
    res.set('Cache-Control', 'no-store')
    res.json({
      at: new Date().toISOString(),
      tickets: rows.map((t) => ({
        serial: t.serial,
        hash: crypto.createHash('sha256').update(qrText(t)).digest('hex'),
        label: t.seat_id ? `Row ${t.row_label} · Seat ${t.seat_num}` : t.section,
        section: t.seat_id ? t.section : '',
        holder: t.full_name,
        valid: ticketIsValid(t),
        checkedInAt: t.checked_in_at,
        checkedInGate: t.checked_in_gate || '',
      })),
      stats: await stats(req.door.eventId),
    })
  }),
)

// What door staff see of a ticket: the seat and the name to check — not the
// buyer's mobile or how they paid.
function doorTicket(t, extra = {}) {
  const j = ticketJson({ ...t, ...extra })
  return {
    serial: j.serial, label: j.label, section: j.section, standing: j.standing, holder: j.holder,
    checkedInAt: j.checkedInAt, checkedInGate: j.checkedInGate,
  }
}

/**
 * Admit a ticket at this door, or say why not. `t` is the ticket row (or null
 * for a code we never issued). Only the UPDATE decides "first in": checking
 * checked_in_at beforehand would let two gates both see it empty.
 */
async function admit(door, t, at = null) {
  if (!t) return { result: 'unknown' }
  // Another event's ticket: which event, and nothing about whose it is.
  if (t.event_id !== door.eventId) return { result: 'other_event', otherEvent: { title: t.title, date: t.date } }
  if (!ticketIsValid(t)) return { result: 'void', ticket: doorTicket(t) }
  const { rows } = await query(
    `UPDATE tickets SET checked_in_at = COALESCE($3, now()), checked_in_gate = $2
      WHERE id = $1 AND status = 'valid' AND checked_in_at IS NULL RETURNING checked_in_at, checked_in_gate`,
    [t.id, door.gate, at],
  )
  if (rows[0]) return { result: 'admitted', ticket: doorTicket(t, rows[0]) }
  const first = (await query('SELECT checked_in_at, checked_in_gate FROM tickets WHERE id = $1', [t.id])).rows[0]
  return { result: 'already', ticket: doorTicket(t, first) }
}

// POST /api/door/scan { code } — a scanned QR code
//                     { serial, manual: true } — a ticket number typed in
// -> { result: admitted | already | void | unknown | other_event, ticket?, stats }
doorRouter.post(
  '/scan',
  ah(async (req, res) => {
    const manual = Boolean(req.body?.manual)
    const t = manual ? await ticketFromSerial(req.body?.serial) : await ticketFromCode(req.body?.code)
    const out = await admit(req.door, t)
    await logScan(req.door.eventId, {
      ticket: t, serial: manual ? req.body?.serial : '', result: out.result, gate: req.door.gate, method: manual ? 'manual' : 'scan',
    })
    res.json({ ...out, stats: await stats(req.door.eventId) })
  }),
)

// POST /api/door/lookup { serial } — what a typed ticket number is, before
// anyone is admitted on it: staff check the name first.
doorRouter.post(
  '/lookup',
  ah(async (req, res) => {
    const t = await ticketFromSerial(req.body?.serial)
    if (!t) return res.json({ result: 'unknown' })
    if (t.event_id !== req.door.eventId) return res.json({ result: 'other_event', otherEvent: { title: t.title, date: t.date } })
    res.json({ result: ticketIsValid(t) ? (t.checked_in_at ? 'already' : 'found') : 'void', ticket: doorTicket(t) })
  }),
)

// POST /api/door/undo { serial } — take back a mistaken admit.
doorRouter.post(
  '/undo',
  ah(async (req, res) => {
    const t = await ticketFromSerial(req.body?.serial)
    if (!t || t.event_id !== req.door.eventId) return res.status(404).json({ error: 'Ticket not found' })
    const { rows } = await query(
      `UPDATE tickets SET checked_in_at = NULL, checked_in_gate = ''
        WHERE id = $1 AND checked_in_at > now() - interval '${UNDO_MINUTES} minutes' RETURNING id`,
      [t.id],
    )
    if (!rows[0]) return res.status(409).json({ error: `Only an admit from the last ${UNDO_MINUTES} minutes can be undone.` })
    await logScan(req.door.eventId, { ticket: t, result: 'undone', gate: req.door.gate, method: 'undo' })
    res.json({ ok: true, stats: await stats(req.door.eventId) })
  }),
)

// POST /api/door/sync { admits: [{ serial, at, manual }] } — what a phone did
// while offline. Each is admitted as of when it happened, unless someone was
// admitted on that ticket first — then it is a conflict, kept for staff.
doorRouter.post(
  '/sync',
  ah(async (req, res) => {
    const admits = (Array.isArray(req.body?.admits) ? req.body.admits : []).slice(0, 500)
    const results = []
    for (const a of admits) {
      const t = await ticketFromSerial(a?.serial)
      // The phone's clock, kept within reason: never the future, never last week.
      const when = new Date(a?.at)
      const at = Number.isNaN(when.getTime()) ? null : new Date(Math.min(Date.now(), Math.max(when.getTime(), Date.now() - 2 * 86_400_000)))
      const out = await admit(req.door, t, at)
      // The same admit arriving twice — a retry whose first answer was lost —
      // is already in, at this gate, at this moment: not a clash with anyone.
      const resent =
        out.result === 'already' && at && out.ticket.checkedInGate === req.door.gate &&
        Math.abs(new Date(out.ticket.checkedInAt) - at) < 1000
      if (resent) {
        results.push({ serial: String(a?.serial || ''), result: 'admitted', ticket: out.ticket })
        continue
      }
      const result = out.result === 'already' ? 'conflict' : out.result
      await logScan(req.door.eventId, {
        ticket: t, serial: a?.serial, result, gate: req.door.gate, method: a?.manual ? 'manual-offline' : 'offline', at,
      })
      results.push({ serial: String(a?.serial || ''), result, ticket: out.ticket })
    }
    if (results.length) {
      const conflicts = results.filter((r) => r.result !== 'admitted').length
      console.log(`[door] ${req.door.event.title}: synced ${results.length} offline admit(s)${conflicts ? `, ${conflicts} conflict(s)` : ''}`)
    }
    res.json({ results, stats: await stats(req.door.eventId) })
  }),
)

// ------------------------------------------------------------ the admin ---
// Mounted behind requireAuth at /api/hosted-events.

async function doorJson(eventId) {
  const [door, scans, gates] = await Promise.all([
    query('SELECT * FROM event_doors WHERE event_id = $1', [eventId]),
    query(
      `SELECT s.*, t.row_label, t.seat_num, t.section, t.seat_id, b.full_name
         FROM ticket_scans s LEFT JOIN tickets t ON t.id = s.ticket_id LEFT JOIN ticket_bookings b ON b.id = t.booking_id
        WHERE s.event_id = $1 ORDER BY s.scanned_at DESC, s.id DESC LIMIT 60`,
      [eventId],
    ),
    query(
      `SELECT checked_in_gate AS gate, count(*)::int AS n FROM tickets
        WHERE event_id = $1 AND status = 'valid' AND checked_in_at IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
      [eventId],
    ),
  ])
  const d = door.rows[0]
  return {
    door: d ? { pin: d.pin, enabled: d.enabled, expiresAt: d.expires_at, live: d.enabled && new Date(d.expires_at) > new Date() } : null,
    url: DOOR_URL,
    qr: await QRCode.toString(DOOR_URL, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }),
    stats: await stats(eventId),
    gates: gates.rows.map((g) => ({ gate: g.gate || '—', admitted: g.n })),
    scans: scans.rows.map((s) => ({
      at: s.scanned_at,
      result: s.result,
      gate: s.gate,
      method: s.method,
      serial: s.serial,
      label: s.ticket_id ? (s.seat_id ? `Row ${s.row_label} · Seat ${s.seat_num}` : s.section) : '',
      holder: s.full_name || '',
    })),
  }
}

adminDoorRouter.get(
  '/:id/door',
  ah(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await doorJson(Number(req.params.id) || 0))
  }),
)

// POST /api/hosted-events/:id/door { action: 'create' | 'new-pin' | 'on' | 'off' }
// A new PIN, or turning access off, signs out every phone at the door.
adminDoorRouter.post(
  '/:id/door',
  ah(async (req, res) => {
    const eventId = Number(req.params.id) || 0
    const ev = (await query(`SELECT id FROM events WHERE id = $1 AND source = ''`, [eventId])).rows[0]
    if (!ev) return res.status(404).json({ error: 'Event not found' })
    const action = String(req.body?.action || '')
    const expires = await doorExpiry(eventId)
    if (action === 'create' || action === 'new-pin') {
      await query(
        `INSERT INTO event_doors (event_id, pin, enabled, expires_at) VALUES ($1, $2, true, $3)
         ON CONFLICT (event_id) DO UPDATE SET pin = $2, enabled = true, expires_at = $3,
           version = event_doors.version + 1, updated_at = now()`,
        [eventId, await newPin(), expires],
      )
    } else if (action === 'on') {
      // Its PIN may have been handed out again meanwhile; a fresh one can't clash.
      const clash = await query(
        `SELECT 1 FROM event_doors a JOIN event_doors b ON a.pin = b.pin AND b.event_id <> a.event_id AND b.enabled
          WHERE a.event_id = $1`,
        [eventId],
      )
      await query(
        `UPDATE event_doors SET enabled = true, expires_at = $2, pin = COALESCE($3, pin), version = version + 1, updated_at = now()
          WHERE event_id = $1`,
        [eventId, expires, clash.rows[0] ? await newPin() : null],
      )
    } else if (action === 'off') {
      await query('UPDATE event_doors SET enabled = false, version = version + 1, updated_at = now() WHERE event_id = $1', [eventId])
    } else {
      return res.status(400).json({ error: 'Unknown action' })
    }
    res.json(await doorJson(eventId))
  }),
)
