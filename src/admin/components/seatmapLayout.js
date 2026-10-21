// The seat-map editor's arithmetic, apart from the component so it stays
// readable (like wheelMath.js beside SpinWheel).
//
// rowLabels() and summarize() mirror server/src/hostedSeatmap.js, which is the
// authority — it re-checks and re-letters everything on save. They are copied
// here so the editor can show the row letters and the ticket counts as you
// draw, without a round trip per click. Keep the two in step.

export const COLORS = ['#A41E22', '#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777']

export const cellKey = (r, c) => `${r}-${c}`

/** A, B … Z, AA, AB … */
export function letters(n) {
  let s = ''
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
  return s
}

/** Row letters from the stage outwards (row A nearest it); from the top with no stage. */
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

/** Per ticket type: seats, standing places, sold, held, available, and the totals. */
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
    const capacity = Number(a.capacity) || 0
    const sold = Math.min(capacity, Number(a.sold) || 0)
    t.standing += capacity
    t.sold += sold
    t.available += Math.max(0, capacity - sold)
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

/** Does the rectangle {r, c, w, h} cover cell (r, c)? */
export const covers = (a, r, c) => r >= a.r && r < a.r + a.h && c >= a.c && c < a.c + a.w

/** Do two rectangles overlap? */
export const overlaps = (a, b) => a.r < b.r + b.h && b.r < a.r + a.h && a.c < b.c + b.w && b.c < a.c + a.w

/** Two corner cells (in any order) as a rectangle. */
export function rectOf(from, to) {
  const r = Math.min(from.r, to.r)
  const c = Math.min(from.c, to.c)
  return { r, c, h: Math.abs(from.r - to.r) + 1, w: Math.abs(from.c - to.c) + 1 }
}

export const newId = (prefix, taken) => {
  let i = taken.length + 1
  while (taken.includes(`${prefix}${i}`)) i += 1
  return `${prefix}${i}`
}

/**
 * A whole hall in one go — rows × seats, aisles, the stage in front and a door
 * at the back — so the admin starts from something close and adjusts, rather
 * than painting three hundred seats by hand.
 */
export function generateHall({ rows, perRow, aisleEvery, stage, entrance, tier }) {
  const nRows = Math.max(1, Math.min(40, Number(rows) || 1))
  const nSeats = Math.max(1, Math.min(60, Number(perRow) || 1))
  const every = Math.max(0, Number(aisleEvery) || 0)
  const aisles = every ? Math.floor((nSeats - 1) / every) : 0
  const width = nSeats + aisles
  const cols = Math.min(80, Math.max(width + 2, 8))
  const left = Math.floor((cols - width) / 2)

  const STAGE_ROWS = 2
  const doorTop = entrance === 'top'
  const doorBottom = entrance === 'bottom'

  // Top to bottom: a door and a gap (or a margin), the stage and a gap if it
  // is in front, the seats, the stage if it is behind, a gap and a door.
  let y = doorTop ? 2 : 1
  let stageRow = null
  if (stage === 'top') {
    stageRow = y
    y += STAGE_ROWS + 1
  }
  const firstSeatRow = y
  y += nRows
  if (stage === 'bottom') {
    stageRow = y + 1
    y += STAGE_ROWS + 1
  }
  const totalRows = y + (doorBottom ? 2 : 1)

  const seats = []
  for (let i = 0; i < nRows; i++) {
    let c = left
    for (let j = 0; j < nSeats; j++) {
      if (every && j > 0 && j % every === 0) c += 1
      seats.push({ r: firstSeatRow + i, c, tier, status: 'free' })
      c += 1
    }
  }

  const areas = []
  if (stageRow !== null) {
    areas.push({ id: 'a1', kind: 'stage', label: 'Stage', r: stageRow, c: left, w: width, h: STAGE_ROWS })
  }
  const doorW = Math.min(4, width)
  const doorC = left + Math.floor((width - doorW) / 2)
  const door = (r, c, w, h) => areas.push({ id: 'a2', kind: 'entrance', label: 'Entrance', r, c, w, h })
  if (doorTop) door(0, doorC, doorW, 1)
  if (doorBottom) door(totalRows - 1, doorC, doorW, 1)
  // A side door near the back of the seats, where halls usually put them.
  const sideRow = Math.max(firstSeatRow, firstSeatRow + nRows - 2)
  if (entrance === 'left') door(sideRow, 0, 1, 2)
  if (entrance === 'right') door(sideRow, cols - 1, 1, 2)

  return { cols, rows: totalRows, seats, areas }
}
