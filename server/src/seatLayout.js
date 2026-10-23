// The rules of an AS-hosted event's hall, with no database and no routes, so
// the seat-map routes (hostedSeatmap.js) and the bookings (bookings.js) share
// them without importing each other.
//
// The layout is a grid of cells. Seats sit on cells; the stage, entrances and
// standing areas are rectangles over cells. Every seat and standing area is
// priced by a ticket type. A seat is free, sold or held (kept off sale) by the
// admin's hand, and taken by a live booking (`holds`, from bookings.js) — a
// booking always wins, so a seat someone has reserved or paid for can never be
// offered again however the admin's own marks read.
//
// rowLabels() and summarize() are mirrored in the admin for its live preview
// (src/admin/components/seatmapLayout.js) — keep them in step.

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

/** Seats numbered 1… left to right within each row, with their row's name. */
export function numberedSeats(layout) {
  const labels = rowLabels(layout)
  const byRow = new Map()
  for (const s of layout.seats) {
    if (!byRow.has(s.r)) byRow.set(s.r, [])
    byRow.get(s.r).push(s)
  }
  const out = []
  for (const [r, list] of byRow) {
    list.sort((a, b) => a.c - b.c)
    list.forEach((s, i) => out.push({ ...s, id: seatId(s), num: String(i + 1), row: labels.get(r) }))
  }
  return out
}

/** A seat's id: its cell. What a booking holds and the hub sends back. */
export const seatId = (s) => `${s.r}-${s.c}`

/** id -> the seat, numbered, with its ticket type — what pricing a booking needs. */
export function seatIndex(layout) {
  const tiers = new Map(layout.tiers.map((t) => [t.id, t]))
  return new Map(numberedSeats(layout).map((s) => [s.id, { ...s, tierInfo: tiers.get(s.tier) }]))
}

/** No bookings: what a layout means before anyone has booked from it. */
export const NO_HOLDS = { seats: new Map(), zones: new Map() }

const zoneHeld = (holds, id) => {
  const z = holds.zones.get(id)
  return { reserved: z?.reserved || 0, paid: z?.paid || 0 }
}

/** Places still on sale in a standing area: capacity − sold by hand − booked. */
export function zoneLeft(area, holds = NO_HOLDS) {
  const z = zoneHeld(holds, area.id)
  return Math.max(0, area.capacity - area.sold - z.reserved - z.paid)
}

/**
 * Counts per ticket type and overall — the admin's summary. `sold` is what is
 * paid for (marked sold by hand, or a paid booking), `reserved` is booked and
 * waiting for payment, `held` is kept off sale; `available` is the rest.
 */
export function summarize(layout, holds = NO_HOLDS) {
  const byTier = new Map(
    layout.tiers.map((t) => [t.id, { ...t, seats: 0, standing: 0, sold: 0, reserved: 0, held: 0, available: 0 }]),
  )
  for (const s of layout.seats) {
    const t = byTier.get(s.tier)
    if (!t) continue
    t.seats += 1
    const booked = holds.seats.get(seatId(s))
    if (booked === 'paid') t.sold += 1
    else if (booked) t.reserved += 1
    else if (s.status === 'sold') t.sold += 1
    else if (s.status === 'held') t.held += 1
    else t.available += 1
  }
  for (const a of layout.areas) {
    if (a.kind !== 'standing') continue
    const t = byTier.get(a.tier)
    if (!t) continue
    const z = zoneHeld(holds, a.id)
    t.standing += a.capacity
    t.sold += Math.min(a.capacity, a.sold + z.paid)
    t.reserved += z.reserved
    t.available += zoneLeft(a, holds)
  }
  const tiers = [...byTier.values()].map((t) => ({ ...t, total: t.seats + t.standing }))
  const sum = (k) => tiers.reduce((n, t) => n + t[k], 0)
  return {
    tiers,
    total: sum('total'),
    sold: sum('sold'),
    reserved: sum('reserved'),
    held: sum('held'),
    available: sum('available'),
    soldValue: tiers.reduce((n, t) => n + t.sold * t.price, 0),
  }
}

/**
 * What the hub draws: the partner shape (rows/zones/tiers/totals — see the
 * route in seatmap.js) with `rows` left empty and the hall in `grid` instead.
 * A seat held, sold or booked goes out as sold: the visitor only needs to know
 * they can't have it.
 */
export function publicSeatmap(layout, holds = NO_HOLDS) {
  const tiers = new Map(layout.tiers.map((t) => [t.id, t]))
  const seats = numberedSeats(layout).map((s) => {
    const t = tiers.get(s.tier)
    return {
      id: s.id,
      r: s.r,
      c: s.c,
      num: s.num,
      row: s.row,
      section: t.name,
      tier: t.id,
      price: t.price,
      color: t.color,
      state: s.status === 'free' && !holds.seats.has(s.id) ? 'free' : 'sold',
    }
  })
  const labels = rowLabels(layout)

  const zones = layout.areas
    .filter((a) => a.kind === 'standing')
    .map((a) => {
      const t = tiers.get(a.tier)
      const left = zoneLeft(a, holds)
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
