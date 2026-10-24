// Seat maps for the events AS Company hosts itself.
//
// A partner's hall is read live from the site that sells it (seatmap.js). An
// event AS hosts — made by hand in the admin, events.source = '' — has no such
// site: its hall is drawn at /admin/events, stored in event_seatmaps, and served
// to the ticketing hub in the same shape as a partner's plus `grid`, because a
// hall we drew ourselves says where the stage and the doors are. The hall's
// rules live in seatLayout.js; what visitors have booked from it, in bookings.js.

import express from 'express'
import { query } from './db.js'
import { revalidateHub } from './hubRevalidate.js'
import { emptyLayout, publicSeatmap, rowLabels, sanitizeLayout, seatId, summarize } from './seatLayout.js'
import { HOLD_HOURS, MAX_TICKETS, expireBookings, feePerTicket, liveHolds, onlinePaymentReady } from './bookings.js'
import { ticketDesign } from './tickets.js'
import { ticketsWhatsAppEnabled } from './ticketsWhatsApp.js'

export const hostedRouter = express.Router()

/**
 * The published map of a hosted event, in the hub's shape — or null. Seats a
 * booking holds go out as taken, and `booking` tells the hub it can sell them
 * (reserve for 24 hours, or buy online when Whish is configured).
 */
export async function loadHostedSeatmap(eventId) {
  const { rows } = await query('SELECT layout FROM event_seatmaps WHERE event_id = $1 AND published', [eventId])
  if (!rows[0]) return null
  await expireBookings(query, eventId)
  const layout = sanitizeLayout(rows[0].layout)
  const data = publicSeatmap(layout, await liveHolds(eventId))
  if (!data.grid.seats.length && !data.zones.length) return null
  return {
    ...data,
    booking: {
      holdHours: HOLD_HOURS,
      maxTickets: MAX_TICKETS,
      online: onlinePaymentReady(),
      // So the hub shows the total with fees before anyone books; the server
      // still prices the booking itself (bookings.js).
      feePerTicket: layout.currency === 'USD' ? await feePerTicket() : 0,
    },
  }
}

// ------------------------------------------------------------- admin routes ---
// Mounted behind requireAuth at /api/hosted-events.

async function hostedEvent(id) {
  const { rows } = await query('SELECT id, slug, title, source, published FROM events WHERE id = $1', [id])
  return rows[0] || null
}

const mapJson = (eventId, row, holds) => {
  const layout = row ? sanitizeLayout(row.layout) : emptyLayout()
  return {
    eventId: Number(eventId),
    exists: Boolean(row),
    // Seat picking on the hub. On for a new map: whether anyone sees it at all
    // is the event's own Publish, and a map nobody switched on looks broken.
    published: row ? Boolean(row.published) : true,
    updatedAt: row?.updated_at || null,
    layout,
    rowLabels: [...rowLabels(layout)].map(([r, label]) => ({ r, label })),
    // Seats live bookings hold — the editor shows them and won't let them go.
    booked: Object.fromEntries(holds.seats),
    bookedZones: Object.fromEntries(holds.zones),
    summary: summarize(layout, holds),
    // The printed ticket's picture and Arabic venue name (tickets.js).
    ticket: ticketDesign(row?.ticket),
    // Whether paid bookings get their tickets on WhatsApp (ticketsWhatsApp.js).
    whatsapp: ticketsWhatsAppEnabled(),
  }
}

// GET /api/hosted-events — every map there is, summarised, for the events list.
hostedRouter.get('/', async (req, res, next) => {
  try {
    await expireBookings()
    const { rows } = await query(
      `SELECT m.event_id, m.published, m.layout, m.updated_at
         FROM event_seatmaps m JOIN events e ON e.id = m.event_id
        WHERE e.source = ''`,
    )
    const out = []
    for (const r of rows) {
      const s = summarize(sanitizeLayout(r.layout), await liveHolds(r.event_id))
      out.push({
        eventId: r.event_id,
        published: r.published,
        updatedAt: r.updated_at,
        total: s.total,
        sold: s.sold,
        reserved: s.reserved,
        available: s.available,
      })
    }
    res.json(out)
  } catch (err) {
    next(err)
  }
})

hostedRouter.get('/:id/seatmap', async (req, res, next) => {
  try {
    const ev = await hostedEvent(req.params.id)
    if (!ev) return res.status(404).json({ error: 'Event not found' })
    await expireBookings(query, ev.id)
    const { rows } = await query('SELECT * FROM event_seatmaps WHERE event_id = $1', [ev.id])
    res.json({
      ...mapJson(ev.id, rows[0], await liveHolds(ev.id)),
      event: { id: ev.id, slug: ev.slug, title: ev.title, source: ev.source, published: ev.published },
    })
  } catch (err) {
    next(err)
  }
})

hostedRouter.put('/:id/seatmap', async (req, res, next) => {
  try {
    const ev = await hostedEvent(req.params.id)
    if (!ev) return res.status(404).json({ error: 'Event not found' })
    // A synced event's hall is the partner's, read live; a second one drawn
    // here would be two answers to "which seats are free".
    if (ev.source) return res.status(409).json({ error: 'Only events AS Company hosts can have a seat map here.' })
    const layout = sanitizeLayout(req.body?.layout)
    const published = Boolean(req.body?.published)
    // Absent = keep what is stored: a tab opened before tickets had a design
    // must not blank it.
    const ticket = req.body?.ticket === undefined ? null : JSON.stringify(ticketDesign(req.body.ticket))

    const current = await query('SELECT updated_at FROM event_seatmaps WHERE event_id = $1', [ev.id])
    // Saved from a page opened before someone else's save: storing it would
    // quietly undo their changes — the seats they marked sold among them.
    const base = req.body?.baseUpdatedAt || null
    const now = current.rows[0]?.updated_at ? new Date(current.rows[0].updated_at).toISOString() : null
    if (now && base && new Date(base).toISOString() !== now) {
      return res.status(409).json({
        error: 'This map was changed by someone else since you opened it. Reload the page to get their changes, then make yours again.',
        stale: true,
      })
    }

    // A seat someone has booked can't be drawn out from under them.
    const holds = await liveHolds(ev.id)
    const kept = new Set(layout.seats.map(seatId))
    const lost = [...holds.seats.keys()].filter((id) => !kept.has(id))
    const lostZones = [...holds.zones.keys()].filter(
      (id) => !layout.areas.some((a) => a.kind === 'standing' && a.id === id),
    )
    if (lost.length || lostZones.length) {
      return res.status(409).json({
        error: `${lost.length ? `${lost.length} booked seat${lost.length > 1 ? 's' : ''}` : 'A booked standing area'} would be removed. Cancel those bookings first, or put the seats back.`,
        booked: lost,
      })
    }

    const { rows } = await query(
      `INSERT INTO event_seatmaps (event_id, published, layout, ticket, updated_at)
       VALUES ($1, $2, $3, COALESCE($4::jsonb, '{}'::jsonb), now())
       ON CONFLICT (event_id) DO UPDATE
         SET published = $2, layout = $3, ticket = COALESCE($4::jsonb, event_seatmaps.ticket), updated_at = now()
       RETURNING *`,
      [ev.id, published, JSON.stringify(layout), ticket],
    )
    // `hasSeatmap` on the event list follows this, so a live event's hub page
    // has to hear about it now.
    if (ev.published) revalidateHub('seat map')
    res.json(mapJson(ev.id, rows[0], holds))
  } catch (err) {
    next(err)
  }
})

hostedRouter.delete('/:id/seatmap', async (req, res, next) => {
  try {
    const live = await query(
      `SELECT 1 FROM ticket_bookings WHERE event_id = $1 AND status IN ('reserved', 'paid') LIMIT 1`,
      [req.params.id],
    )
    if (live.rows[0]) return res.status(409).json({ error: 'This event has live bookings — cancel them first.' })
    await query('DELETE FROM event_seatmaps WHERE event_id = $1', [req.params.id])
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
