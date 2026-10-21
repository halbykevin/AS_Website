// Seat maps for the events AS Company hosts itself.
//
// A partner's hall is read live from the site that sells it (seatmap.js). An
// event AS hosts — made by hand in the admin, events.source = '' — has no such
// site: its hall is drawn at /admin/events, stored in event_seatmaps, and served
// to the ticketing hub in the same shape as a partner's, so the hub's seat
// picker and its WhatsApp request work unchanged. It adds `grid`, because a
// hall we drew ourselves says where the stage and the doors are.
//
// The layout is a grid of cells. Seats sit on cells; the stage, entrances and
// standing areas are rectangles over cells. Every seat and standing area is
// priced by a ticket type. Availability is per seat (free | sold | held) and,
// for a standing area, capacity minus sold — staff update both as they confirm
// requests. Like everything on the hub, a pick is a request: nothing here holds
// a seat until someone marks it sold.

import express from 'express'
import { query } from './db.js'
import { revalidateHub } from './hubRevalidate.js'

export const hostedRouter = express.Router()

const LIMITS = { cols: [4, 80], rows: [4, 60], tiers: 12, areas: 40, label: 40 }
const AREA_KINDS = new Set(['stage', 'entrance', 'standing'])
const SEAT_STATES = new Set(['free', 'sold', 'held'])
const CURRENCIES = new Set(['USD', 'LBP'])
const DEFAULT_COLORS = ['#A41E22', '#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777']

const int = (v, min, max, fallback = min) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
const text = (v, max = LIMITS.label) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const color = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toUpperCase() : fallback)
const money = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}
const id = (v, prefix, i) => (/^[a-z0-9_-]{1,24}$/i.test(String(v || '')) ? String(v) : `${prefix}${i + 1}`)

export const emptyLayout = () => ({
  currency: 'USD',
  cols: 24,
  rows: 16,
  tiers: [{ id: 't1', name: 'Standard', price: 0, color: DEFAULT_COLORS[0] }],
  seats: [],
  areas: [],
  rowNames: {},
})

/**
 * Whatever the admin sent, as a layout we are willing to store and serve: the
 * grid clamped, every seat and area inside it, one seat per cell, ticket types
 * that exist, colours that are colours. Anything else is dropped rather than
 * refused — the editor never sends it, so it can only be a stale tab or a
 * hand-made request, and neither should be able to store a broken hall.
 */
export function sanitizeLayout(input) {
  const src = input && typeof input === 'object' ? input : {}
  const cols = int(src.cols, ...LIMITS.cols, 24)
  const rows = int(src.rows, ...LIMITS.rows, 16)

  const tiers = []
  for (const [i, t] of (Array.isArray(src.tiers) ? src.tiers : []).slice(0, LIMITS.tiers).entries()) {
    const tid = id(t?.id, 't', i)
    if (tiers.some((x) => x.id === tid)) continue
    tiers.push({
      id: tid,
      name: text(t?.name) || `Ticket ${i + 1}`,
      price: money(t?.price),
      color: color(t?.color, DEFAULT_COLORS[i % DEFAULT_COLORS.length]),
    })
  }
  if (!tiers.length) tiers.push(emptyLayout().tiers[0])
  const tierIds = new Set(tiers.map((t) => t.id))

  const taken = new Set()
  const seats = []
  for (const s of Array.isArray(src.seats) ? src.seats : []) {
    const r = int(s?.r, 0, rows - 1, -1)
    const c = int(s?.c, 0, cols - 1, -1)
    if (r !== Math.round(Number(s?.r)) || c !== Math.round(Number(s?.c))) continue // off the grid
    const key = `${r}-${c}`
    if (taken.has(key)) continue
    taken.add(key)
    seats.push({
      r,
      c,
      tier: tierIds.has(s?.tier) ? s.tier : tiers[0].id,
      status: SEAT_STATES.has(s?.status) ? s.status : 'free',
    })
  }

  const areas = []
  for (const [i, a] of (Array.isArray(src.areas) ? src.areas : []).slice(0, LIMITS.areas).entries()) {
    if (!AREA_KINDS.has(a?.kind)) continue
    const r = int(a?.r, 0, rows - 1)
    const c = int(a?.c, 0, cols - 1)
    let aid = id(a?.id, 'a', i)
    while (areas.some((x) => x.id === aid)) aid = `${aid}x`.slice(-24)
    const area = {
      id: aid,
      kind: a.kind,
      label: text(a?.label) || defaultLabel(a.kind),
      r,
      c,
      w: int(a?.w, 1, cols - c),
      h: int(a?.h, 1, rows - r),
    }
    if (a.kind === 'standing') {
      area.tier = tierIds.has(a?.tier) ? a.tier : tiers[0].id
      area.capacity = int(a?.capacity, 0, 100000, 0)
      area.sold = int(a?.sold, 0, area.capacity, 0)
    }
    areas.push(area)
  }

  const rowNames = {}
  for (const [k, v] of Object.entries(src.rowNames && typeof src.rowNames === 'object' ? src.rowNames : {})) {
    const r = Number(k)
    const name = text(v, 8)
    if (Number.isInteger(r) && r >= 0 && r < rows && name) rowNames[r] = name
  }

  return {
    currency: CURRENCIES.has(src.currency) ? src.currency : 'USD',
    cols,
    rows,
    tiers,
    seats,
    areas,
    rowNames,
  }
}

function defaultLabel(kind) {
  return kind === 'stage' ? 'Stage' : kind === 'entrance' ? 'Entrance' : 'Standing'
}

/** A, B … Z, AA, AB … — the usual way halls letter their rows. */
function letters(n) {
  let s = ''
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
  return s
}

/**
 * Each row of seats and its name. Rows are lettered from the stage outwards —
 * row A is the one nearest it — because that is what every ticket in a hall
 * means by row A; with no stage drawn they run from the top. A name the admin
 * typed for a row wins.
 */
export function rowLabels(layout) {
  const used = [...new Set(layout.seats.map((s) => s.r))].sort((a, b) => a - b)
  const stage = layout.areas.find((a) => a.kind === 'stage')
  const seatMid = used.length ? (used[0] + used[used.length - 1]) / 2 : 0
  const fromBottom = stage ? stage.r + stage.h / 2 > seatMid : false
  const order = fromBottom ? [...used].reverse() : used
  const labels = new Map()
  order.forEach((r, i) => labels.set(r, layout.rowNames?.[r] || letters(i)))
  return labels
}

/** Seats numbered 1… left to right within each row. */
function numberedSeats(layout) {
  const labels = rowLabels(layout)
  const byRow = new Map()
  for (const s of layout.seats) {
    if (!byRow.has(s.r)) byRow.set(s.r, [])
    byRow.get(s.r).push(s)
  }
  const out = []
  for (const [r, list] of byRow) {
    list.sort((a, b) => a.c - b.c)
    list.forEach((s, i) => out.push({ ...s, num: String(i + 1), row: labels.get(r) }))
  }
  return out
}

/** Counts per ticket type and overall — the admin's summary. */
export function summarize(layout) {
  const byTier = new Map(
    layout.tiers.map((t) => [t.id, { ...t, seats: 0, standing: 0, sold: 0, held: 0, available: 0 }]),
  )
  for (const s of layout.seats) {
    const t = byTier.get(s.tier)
    if (!t) continue
    t.seats += 1
    if (s.status === 'sold') t.sold += 1
    else if (s.status === 'held') t.held += 1
    else t.available += 1
  }
  for (const a of layout.areas) {
    if (a.kind !== 'standing') continue
    const t = byTier.get(a.tier)
    if (!t) continue
    t.standing += a.capacity
    t.sold += a.sold
    t.available += Math.max(0, a.capacity - a.sold)
  }
  const tiers = [...byTier.values()].map((t) => ({ ...t, total: t.seats + t.standing }))
  const sum = (k) => tiers.reduce((n, t) => n + t[k], 0)
  return {
    tiers,
    total: sum('total'),
    sold: sum('sold'),
    held: sum('held'),
    available: sum('available'),
    soldValue: tiers.reduce((n, t) => n + t.sold * t.price, 0),
  }
}

/**
 * What the hub draws: the partner shape (rows/zones/tiers/totals — see the
 * route in seatmap.js) with `rows` left empty and the hall in `grid` instead.
 * A held seat goes out as sold: the visitor only needs to know they can't have it.
 */
export function publicSeatmap(layout) {
  const tiers = new Map(layout.tiers.map((t) => [t.id, t]))
  const seats = numberedSeats(layout).map((s) => {
    const t = tiers.get(s.tier)
    return {
      id: `${s.r}-${s.c}`,
      r: s.r,
      c: s.c,
      num: s.num,
      row: s.row,
      section: t.name,
      tier: t.id,
      price: t.price,
      color: t.color,
      state: s.status === 'free' ? 'free' : 'sold',
    }
  })
  const labels = rowLabels(layout)

  const zones = layout.areas
    .filter((a) => a.kind === 'standing')
    .map((a) => {
      const t = tiers.get(a.tier)
      const left = Math.max(0, a.capacity - a.sold)
      return {
        id: a.id,
        name: a.label,
        price: t.price,
        currency: layout.currency,
        color: t.color,
        inStock: left > 0,
        left,
        min: 1,
        max: Math.min(10, left),
      }
    })

  const legend = layout.tiers
    .map((t) => {
      const mine = seats.filter((s) => s.tier === t.id)
      return {
        name: t.name,
        price: t.price,
        currency: layout.currency,
        color: t.color,
        seats: mine.length,
        available: mine.filter((s) => s.state === 'free').length,
      }
    })
    .filter((t) => t.seats > 0)
    .sort((a, b) => b.price - a.price)

  return {
    currency: layout.currency,
    map: null,
    rows: [],
    grid: {
      cols: layout.cols,
      rows: layout.rows,
      rowLabels: [...labels].map(([r, label]) => ({ r, label })),
      seats,
      areas: layout.areas.map((a) => ({
        id: a.id,
        kind: a.kind,
        label: a.label,
        r: a.r,
        c: a.c,
        w: a.w,
        h: a.h,
        ...(a.kind === 'standing' ? { color: tiers.get(a.tier).color } : {}),
      })),
    },
    zones,
    tiers: legend,
    totals: { seats: seats.length, available: seats.filter((s) => s.state === 'free').length },
  }
}

/** The published map of a hosted event, in the hub's shape — or null. */
export async function loadHostedSeatmap(eventId) {
  const { rows } = await query('SELECT layout FROM event_seatmaps WHERE event_id = $1 AND published', [eventId])
  if (!rows[0]) return null
  const layout = sanitizeLayout(rows[0].layout)
  const data = publicSeatmap(layout)
  return data.grid.seats.length || data.zones.length ? data : null
}

// ------------------------------------------------------------- admin routes ---
// Mounted behind requireAuth at /api/hosted-events.

async function hostedEvent(id) {
  const { rows } = await query('SELECT id, slug, title, source, published FROM events WHERE id = $1', [id])
  return rows[0] || null
}

const mapJson = (eventId, row) => {
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
    summary: summarize(layout),
  }
}

// GET /api/hosted-events — every map there is, summarised, for the events list.
hostedRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT m.event_id, m.published, m.layout, m.updated_at
         FROM event_seatmaps m JOIN events e ON e.id = m.event_id
        WHERE e.source = ''`,
    )
    res.json(
      rows.map((r) => {
        const s = summarize(sanitizeLayout(r.layout))
        return {
          eventId: r.event_id,
          published: r.published,
          updatedAt: r.updated_at,
          total: s.total,
          sold: s.sold,
          available: s.available,
        }
      }),
    )
  } catch (err) {
    next(err)
  }
})

hostedRouter.get('/:id/seatmap', async (req, res, next) => {
  try {
    const ev = await hostedEvent(req.params.id)
    if (!ev) return res.status(404).json({ error: 'Event not found' })
    const { rows } = await query('SELECT * FROM event_seatmaps WHERE event_id = $1', [ev.id])
    res.json({
      ...mapJson(ev.id, rows[0]),
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
    const { rows } = await query(
      `INSERT INTO event_seatmaps (event_id, published, layout, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (event_id) DO UPDATE SET published = $2, layout = $3, updated_at = now()
       RETURNING *`,
      [ev.id, published, JSON.stringify(layout)],
    )
    // `hasSeatmap` on the event list follows this, so a live event's hub page
    // has to hear about it now.
    if (ev.published) revalidateHub('seat map')
    res.json(mapJson(ev.id, rows[0]))
  } catch (err) {
    next(err)
  }
})

hostedRouter.delete('/:id/seatmap', async (req, res, next) => {
  try {
    await query('DELETE FROM event_seatmaps WHERE event_id = $1', [req.params.id])
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
