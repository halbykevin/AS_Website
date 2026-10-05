// antoineticketing.com — the hall rebuilt from Tixity's own seating plan.
//
// Antoine sells through Tixity, and every night of every show is its own
// product carrying its own copy of the venue's plan. Two anonymous reads give
// the whole picture:
//
//   products?id=<night>     the public API the site's own bundle calls: the
//                           night's ticket categories — name, colour, price,
//                           how many are left — and which plan it is sold on
//   json.php getRendererData
//                           what their seat-map iframe loads: every seat with
//                           its position, row, number, category and status
//
// A category is one of two products, and its `numbering` says which:
//
//   numbered ("both")  a seat in a drawn hall. The plan is a list of
//                      coordinates rather than a picture we could serve, so the
//                      hall is rebuilt as rows, the way the box office's is
//   "none"             free seating / general admission — a quantity. Where the
//                      plan draws those areas (Metro Al Madina's table zones)
//                      the drawing is built from their rectangles and served as
//                      the map; otherwise the zone list is the whole choice
//
// Status is the plan's own: 0 is free, anything else (sold, or held in someone's
// basket) is not. Checked against the categories' free counts on every seated
// hall Antoine listed when this was written — they agreed seat for seat.

import { cssColor, fetchJson, tiersFrom } from './http.js'
import { sanitizeSvg } from './svg.js'

export const KEY = 'antoineticketing'
export const HOSTS = new Set(['antoineticketing.com', 'www.antoineticketing.com'])

const API = 'https://www.antoineticketing.com/tixity/api/public/v1/products'
const RENDERER = 'https://tixity.antoineticketing.com/json.php'

// A hall with more parts than this is not one we have seen; the first few still
// make a usable picker, and each part is a request.
const MAX_PARTS = 3

const productIdOf = (url) => (String(url).match(/\/events\/(\d+)/) || [])[1] || ''
const isId = (v) => /^\d{1,12}$/.test(String(v ?? ''))
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

async function product(id) {
  return fetchJson(`${API}?id=${encodeURIComponent(id)}`, {
    headers: { 'X-Requested-With': 'xmlhttprequest', Accept: 'application/json' },
  })
}

/**
 * The night's own product. Every row of ours points at one (`/events/<night>`),
 * but the event's main link is the show, which has no plan of its own — so a
 * show resolves to the night asked for, else its first.
 */
async function nightProduct(id, date) {
  const p = await product(id)
  if (p?.rep !== 'main' || !Array.isArray(p.subs) || !p.subs.length) return p
  const day = String(date || '').slice(0, 10)
  const sub = p.subs.find((s) => s?.schedule?.date === day) || p.subs[0]
  return isId(sub?.id) ? product(sub.id) : null
}

async function plan(pmId, partId) {
  const res = await fetchJson(RENDERER, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `https://tixity.antoineticketing.com/index.php?action=run&task=seatmaprenderer&pm_id=${pmId}&pmp_id=${partId}`,
    },
    body: new URLSearchParams({ page: 'seatmap/getRendererData', pm_id: pmId, pmp_id: partId }).toString(),
  })
  if (res?.status !== true || typeof res.data !== 'string' || !res.data) return null
  try {
    return JSON.parse(res.data)
  } catch {
    return null
  }
}

export async function load(url, { date } = {}) {
  const id = productIdOf(url)
  if (!id) return empty()
  const night = await nightProduct(id, date)
  if (!night || !Array.isArray(night.categories) || !night.categories.length) return empty()

  // Only the parts this night actually sells in, and only ids — these go into
  // a request, so nothing that isn't a number gets that far.
  const pm = night.placemap || {}
  const used = new Set(night.categories.map((c) => String(c?.placemapPartId ?? '')))
  const parts = (pm.sections || [])
    .map((s) => String(s?.id ?? ''))
    .filter((pid) => isId(pid) && (used.has(pid) || used.has('')))
    .slice(0, MAX_PARTS)

  const layouts = isId(pm.id)
    ? (await Promise.all(parts.map((pid) => plan(pm.id, pid).catch(() => null)))).filter(Boolean)
    : []
  return parseHall(night, layouts)
}

/** One night's categories + its plan(s) -> the shape every source answers in. */
export function parseHall(night, layouts = []) {
  const currency = currencyOf(night.categories)
  const cats = night.categories.map((c) => categoryOf(c, currency)).filter(Boolean)
  const byId = new Map(cats.map((c) => [c.id, c]))

  const seated = cats.filter((c) => c.numbered)
  const rows = seated.length ? layouts.flatMap((l) => buildRows(l, byId)) : []
  // A numbered category whose seats we could not draw is still on sale — offer
  // it by quantity rather than lose it, the way the box office lists the zones
  // it didn't draw.
  const drawn = new Set(rows.flatMap((r) => r.seats.map((s) => s.cat)))
  const zones = cats.filter((c) => !c.numbered || !drawn.has(c.id)).map(zoneOf)

  const seats = rows.flatMap((r) => r.seats).filter((s) => s.state !== 'gap')
  const map = zones.length ? layouts.map((l) => sectionMap(l, zones)).find(Boolean) || null : null

  return {
    currency,
    zones,
    tiers: tiersFrom([
      ...seats.map((s) => ({ price: s.price, currency, color: s.color, free: s.state === 'free' })),
      // A zone's legend swatch is its category colour whatever is left in it.
      ...zones.map((z) => ({ price: z.price, currency, color: byId.get(z.id)?.color, free: true, seats: 0, available: 0 })),
    ]),
    map,
    rows: rows.map((r) => ({ ...r, seats: r.seats.map(({ cat, ...s }) => s) })),
    totals: { seats: seats.length, available: seats.filter((s) => s.state === 'free').length },
  }
}

// Antoine prices everything in dollars and lira side by side; the hub quotes
// one currency, and every other source quotes dollars.
function currencyOf(categories) {
  const keys = categories.flatMap((c) => Object.keys(c?.price || {}))
  return keys.includes('USD') ? 'USD' : keys[0] || 'USD'
}

function categoryOf(c, currency) {
  if (!isId(c?.id)) return null
  const a = c.availability || {}
  const free = Math.max(0, Number(a.free) || 0)
  return {
    id: String(c.id),
    name: clean(c.name) || 'Ticket',
    price: Number(c.price?.[currency]?.amount) || 0,
    color: cssColor(c.color),
    numbered: String(c.numbering || 'none').toLowerCase() !== 'none',
    inStock: !a.unavailable && free > 0,
    free,
    // Their per-category cap ("you have reached the maximum of 35 tickets").
    limit: Number(a.seatLimit) || 0,
  }
}

function zoneOf(c) {
  return {
    id: c.id,
    name: c.name,
    price: c.price,
    inStock: c.inStock,
    min: 1,
    max: Math.max(1, Math.min(10, c.free || 10, c.limit || 10)),
    left: c.free,
  }
}

// ------------------------------------------------------------- the hall ---

const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)

// The label that says which way the room faces. "Stage" in every plan seen so
// far; the rest are there because these are Beirut theatres.
const STAGE = /\b(stage|sc[eè]ne)\b|مسرح|خشبة/i

/**
 * The plan's seats as rows of a grid the hub can draw.
 *
 * The plan is free-form: each seat has an x/y, side blocks are tilted and
 * curved, and a row letter is per block — so row A is three runs of seats, a
 * centre block and two angled wings, at almost the same height. They are put
 * back together as one row when they share a letter and a height, and each
 * seat takes the column its x falls in, so the aisles between blocks stay
 * aisles and the wings stay where they are.
 *
 * Within one block's row, seats a normal step apart stay neighbours even when
 * the step drifts (the back rows of a fan are spaced wider than the front, and
 * rounding every x to the grid would open a one-seat hole in the middle of
 * them). Only a real gap — an aisle — becomes empty columns.
 */
function buildRows(layout, byId) {
  let seats = readSeats(layout)
  if (!seats.length) return []

  // The hub always draws the stage on top. A plan drawn the other way up is
  // turned round, both axes — mirroring only one would swap house left and
  // house right.
  const stage = stageY(layout)
  if (stage !== null && stage > median(seats.map((s) => s.y))) {
    seats = seats.map((s) => ({ ...s, x: -s.x, y: -s.y }))
  }

  const runs = new Map()
  for (const s of seats) {
    const run = runs.get(s.run) || { row: s.row, seats: [] }
    run.seats.push(s)
    runs.set(s.run, run)
  }
  const steps = []
  for (const run of runs.values()) {
    run.seats.sort((a, b) => a.x - b.x)
    run.y = mean(run.seats.map((s) => s.y))
    for (let i = 1; i < run.seats.length; i++) {
      const d = run.seats[i].x - run.seats[i - 1].x
      if (d > 0.5) steps.push(d)
    }
    const own = []
    for (let i = 1; i < run.seats.length; i++) own.push(run.seats[i].x - run.seats[i - 1].x)
    run.step = median(own.filter((d) => d > 0.5))
  }
  const pitch = median(steps) || 25

  // Runs into rows: same letter, about the same height. A balcony that starts
  // its letters again is far above and stays its own row.
  const lines = []
  for (const run of [...runs.values()].sort((a, b) => a.y - b.y)) {
    const line = lines.find((l) => l.row === run.row && Math.abs(l.y - run.y) < pitch * 2)
    if (line) {
      line.runs.push(run)
      line.y = mean(line.runs.map((r) => r.y))
    } else {
      lines.push({ row: run.row, y: run.y, runs: [run] })
    }
  }
  lines.sort((a, b) => a.y - b.y)

  const minX = Math.min(...seats.map((s) => s.x))
  const placed = lines.map((line) => {
    const all = line.runs
      .flatMap((run) => run.seats.map((s) => ({ ...s, step: run.step || pitch })))
      .sort((a, b) => a.x - b.x)
    const cols = []
    let prev = null
    for (const s of all) {
      const at = Math.round((s.x - minX) / pitch)
      let col
      if (!prev) col = at
      else if (prev.run === s.run && s.x - prev.x <= s.step * 1.5) col = cols.at(-1).col + 1
      // An aisle is at least one empty column, however the rounding falls.
      else col = Math.max(cols.at(-1).col + (s.x - prev.x > pitch * 1.5 ? 2 : 1), at)
      cols.push({ col, seat: s })
      prev = s
    }
    return { line, cols }
  })

  const first = Math.min(...placed.map((p) => p.cols[0].col))
  const last = Math.max(...placed.map((p) => p.cols.at(-1).col))

  return placed.map(({ line, cols }, i) => {
    const at = new Map(cols.map((c) => [c.col, c.seat]))
    const out = []
    for (let c = first; c <= last; c++) {
      const s = at.get(c)
      const cat = s && byId.get(s.cat)
      out.push(
        !s
          ? { id: `${i}-${c}`, num: '', price: 0, color: '', state: 'gap', cat: '' }
          : {
              id: `${i}-${c}`,
              num: s.num,
              price: cat?.price ?? 0,
              color: cat?.color || '',
              // A seat in a category not sold tonight is drawn, as taken: the
              // room is only legible if every seat in it is there.
              state: s.free && cat?.inStock ? 'free' : 'sold',
              cat: s.cat,
            },
      )
    }
    return { id: `r${i}`, section: levelOf(cols.map((c) => byId.get(c.seat.cat))), label: line.row, seats: out }
  })
}

function readSeats(layout) {
  const seats = []
  ;(layout?.seatmap?.blocks || []).forEach((block, b) => {
    for (const row of block?.rows || []) {
      const label = clean(row?.attributes?.label)
      for (const seat of row?.seats || []) {
        const a = seat?.attributes || {}
        const x = Number(a.position?.[0])
        const y = Number(a.position?.[1])
        // `invisible` seats are placeholders in the plan (a removed seat keeps
        // the spacing); they are not for sale and are not in any count.
        if (a.invisible || !Number.isFinite(x) || !Number.isFinite(y)) continue
        seats.push({
          x,
          y,
          run: `${b}|${label}`,
          row: label,
          num: clean(a.label),
          cat: String(a.categoryId ?? ''),
          free: Number(a.status) === 0,
        })
      }
    }
  })
  return seats
}

function stageY(layout) {
  const unit = (layout?.seatmap?.units || []).find(
    (u) => u?.type === 'text' && STAGE.test(String(u?.attributes?.label || '')),
  )
  const y = Number(unit?.attributes?.position?.[1])
  return Number.isFinite(y) ? y : null
}

/**
 * What a row is called in a message, when the hall needs telling apart.
 *
 * Halls with a balcony name their categories "Salle | Blue Zone", "Balcon |
 * Purple Zone" and start their row letters again upstairs, so "Row C" alone is
 * two places. The part before the bar is the level; a row whose seats all
 * agree on one gets it. Halls that name categories by colour alone have one
 * set of letters, and the row is enough.
 */
function levelOf(cats) {
  const levels = new Set(
    cats.map((c) => {
      const name = c?.name || ''
      const bar = name.indexOf('|')
      return bar > 0 ? clean(name.slice(0, bar)) : ''
    }),
  )
  return levels.size === 1 ? [...levels][0] : ''
}

// --------------------------------------------------------- the zone map ---

/**
 * The general-admission areas as a drawing, from the plan's own rectangles.
 *
 * Metro Al Madina sells tables by zone — A+, A, B, C, nearest the stage first —
 * and which is nearest is the question the price answers, so the plan's
 * picture of it is worth showing. Built here from their numbers rather than
 * served, then run through the same allow-list as a partner's SVG anyway: the
 * labels are their text.
 */
function sectionMap(layout, zones) {
  const plan = layout?.seatmap || {}
  const ids = new Set(zones.map((z) => z.id))
  const areas = (plan.sections || [])
    .map((s) => ({ ...rectOf(s?.attributes), id: String(s?.attributes?.categoryId ?? ''), sub: s?.subtype, a: s?.attributes || {} }))
    .filter((s) => s.sub === 'rect' && s.w > 0 && s.h > 0 && ids.has(s.id))
  if (!areas.length) return null

  const shapes = (plan.units || [])
    .filter((u) => u?.type === 'shape' && u?.subtype === 'rect')
    .map((u) => ({ ...rectOf(u.attributes), fill: cssColor(u.attributes?.styles?.fill) || '#9ca3af' }))
    .filter((u) => u.w > 0 && u.h > 0)
  const texts = (plan.units || [])
    .filter((u) => u?.type === 'text' && clean(u?.attributes?.label))
    .map((u) => ({ x: Number(u.attributes.position?.[0]) || 0, y: Number(u.attributes.position?.[1]) || 0, label: clean(u.attributes.label), size: Number(u.attributes.size) || 24 }))

  const boxes = [...areas, ...shapes]
  const x0 = Math.min(...boxes.map((b) => b.cx - b.w / 2))
  const y0 = Math.min(...boxes.map((b) => b.cy - b.h / 2))
  const x1 = Math.max(...boxes.map((b) => b.cx + b.w / 2))
  const y1 = Math.max(...boxes.map((b) => b.cy + b.h / 2))
  const pad = Math.max(x1 - x0, y1 - y0) * 0.03

  const byZone = new Map(zones.map((z) => [z.id, z]))
  const colorOf = (area) => {
    const own = cssColor(area.a.color)
    // Their zones are drawn white with a black label; on our card that is a
    // white box on white, so a white area takes its category's colour instead.
    return own && !/^rgba?\(255,255,255/.test(own) && !/^#fff(fff)?$/i.test(own) ? own : ''
  }
  const svg = [
    ...shapes.map((s) => `<rect ${rectAttrs(s)} fill="${s.fill}" />`),
    // A label on one of their shapes ("STAGE" on the stage) is lettered white;
    // one standing on the card would vanish in white, so it is not.
    ...texts.map((t) => text(t.x, t.y, t.label, t.size, shapes.some((s) => inside(t, s)) ? '#ffffff' : '#383F41')),
    ...areas.map((area) => {
      const size = Math.min(Number(area.a.label?.size) || 40, area.h * 0.45)
      return (
        `<g data-sid="${area.id}">` +
        `<rect ${rectAttrs(area)} fill="${colorOf(area) || '#A41E22'}" fill-opacity="0.18" stroke="#A41E22" stroke-width="2" />` +
        text(area.cx, area.cy, byZone.get(area.id)?.name || clean(area.a.label?.text), size, '#383F41') +
        '</g>'
      )
    }),
  ].join('')

  return {
    viewBox: [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2].map((n) => Math.round(n)).join(' '),
    svg: sanitizeSvg(svg),
    sections: areas.map((area) => {
      const z = byZone.get(area.id)
      return { id: z.id, name: z.name, kind: 'zone', color: '#A41E22', price: z.price, inStock: z.inStock, min: z.min, max: z.max }
    }),
  }
}

const inside = (p, r) => Math.abs(p.x - r.cx) <= r.w / 2 && Math.abs(p.y - r.cy) <= r.h / 2

// A plan's shape is placed by its centre.
function rectOf(a) {
  return {
    cx: Number(a?.position?.[0]) || 0,
    cy: Number(a?.position?.[1]) || 0,
    w: Number(a?.width) || 0,
    h: Number(a?.height) || 0,
    rot: Number(a?.rotation) || 0,
  }
}

const n = (v) => Math.round(v * 10) / 10

function rectAttrs(r) {
  const rot = r.rot ? ` transform="rotate(${n(r.rot)} ${n(r.cx)} ${n(r.cy)})"` : ''
  return `x="${n(r.cx - r.w / 2)}" y="${n(r.cy - r.h / 2)}" width="${n(r.w)}" height="${n(r.h)}"${rot}`
}

const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function text(x, y, label, size, fill) {
  return `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" font-weight="700" fill="${fill}" text-anchor="middle" dominant-baseline="middle">${escapeText(label)}</text>`
}

const empty = () => ({ currency: 'USD', zones: [], tiers: [], map: null, rows: [], totals: { seats: 0, available: 0 } })

// Every plan Antoine has published is one drawing per night: there is never a
// block to open on its own.
export const loadSection = async () => null
