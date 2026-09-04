// ihjoz.com — the hall as a drawing plus a table of what is on sale in it.
//
// A seated ihjoz event renders the venue as an inline SVG where every block a
// visitor can buy is a shape carrying `sid`, `name`, `seating` and `color`, and
// ships `var sectionsData = {…}` beside it: per block, the ticket types with
// their prices and the ids of the seats already gone. Blocks come in two kinds
// and they are genuinely different products:
//
//   seating="assigned"    numbered seats — a second SVG per block, fetched from
//                         /sections/<id>/map, one <rect label="G-9"> per seat
//   seating="unassigned"  a zone or a table sold whole (min 4 / max 4 = a table
//                         of four), so the choice is a quantity, not a seat
//
// One show can have both: the event this was written against has six seated
// zones and 82 tables around them. That is also why the drawing is served
// rather than rebuilt — 82 tables called V1…VII 25 are meaningless as a list,
// and where they sit is the whole question the customer is asking.
//
// Per-block seats are fetched only when someone opens a block. Loading all six
// up front is 200 KB for a map most visitors will pick one zone from.

import { cssColor, fetchJson, fetchText, parseMoney, tiersFrom } from './http.js'
import { attr, extractSvg, sanitizeSvg, viewBoxOf } from './svg.js'

export const KEY = 'ihjoz'
export const HOSTS = new Set(['ihjoz.com', 'www.ihjoz.com'])

const BASE = 'https://ihjoz.com'

// Any shape can be a block; ihjoz uses <rect>, but the class is what marks it.
const SECTION_TAG = /<(?:rect|path|circle|polygon|ellipse)\b[^>]*?class="section"[^>]*>/gi
// A seat in a block's own SVG: the label is "<row>-<number>", and the id
// encodes its place in the grid, which is what lets a missing seat stay a gap.
const SEAT_TAG = /<rect\b[^>]*\blabel="[^"]*"[^>]*>/gi

const eventIdOf = (url) => (String(url).match(/\/events\/(\d+)/) || [])[1] || ''

// ihjoz prints "$" rather than a code, and sells in dollars.
const currencyOf = (html) => {
  const sym = (html.match(/var eventCurrency = "([^"]*)"/) || [])[1] || ''
  return sym === '$' || !sym ? 'USD' : sym.toUpperCase()
}

function parseSectionsData(html) {
  const m = html.match(/var sectionsData = (\{[\s\S]*?\});?\s*\n/)
  if (!m) return {}
  try {
    return JSON.parse(m[1])
  } catch {
    return {}
  }
}

/**
 * The date pills above the map, `id` = ihjoz's event_date_id.
 *
 * Their label is "Fri, Sep 18 22:30" — no year — so a date is matched on month
 * and day. A run that plays the same day two years running would be two events
 * to us anyway, since our own rows carry the year. A day with two shows on it
 * resolves to the first pill: no ihjoz event we list has one, and matching
 * their 24-hour label against our "08:00 PM" would be a converter written for
 * nothing. Add it the day one appears.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function parseDateButtons(html) {
  const out = []
  const re = /<button[^>]*\bclass="[^"]*date-filter[^"]*"[^>]*>([\s\S]*?)<\/button>/gi
  let m
  while ((m = re.exec(html))) {
    const id = (m[0].match(/\bid="(\d+)"/) || [])[1]
    if (!id) continue
    const text = m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const md = text.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2})/)
    out.push({
      id,
      label: text,
      month: md ? MONTHS.indexOf(md[1].toLowerCase()) + 1 : 0,
      day: md ? Number(md[2]) : 0,
    })
  }
  // The same pill is rendered twice on some layouts (a phone row and a desktop
  // row); the id is the identity.
  return out.filter((d, i) => out.findIndex((o) => o.id === d.id) === i)
}

function sectionShapes(html) {
  const shapes = []
  let m
  SECTION_TAG.lastIndex = 0
  while ((m = SECTION_TAG.exec(html))) {
    const tag = m[0]
    shapes.push({
      sid: attr(tag, 'sid'),
      name: (attr(tag, 'name') || '').replace(/\s+/g, ' ').trim(),
      seating: (attr(tag, 'seating') || '').toLowerCase(),
      color: attr(tag, 'color'),
    })
  }
  return shapes.filter((s) => s.sid)
}

/** What one block costs and whether it is on sale at all. */
function priceOf(record, currency) {
  const types = record?.ticket_types || []
  if (!types.length) return null
  const first = types[0]
  const price = parseMoney(first.price)
  const min = Number(first.min_quantity) || 1
  const max = Number(first.max_quantity) || min
  return {
    name: (first.name || '').replace(/\s+/g, ' ').trim(),
    price: price.amount,
    currency: price.currency || currency,
    min,
    max: Math.max(min, max),
  }
}

/**
 * The whole map: the drawing, what each block is, and the zones that are sold
 * by quantity. Seats for a numbered block come from loadSection().
 */
export async function load(url, { date } = {}) {
  const eventId = eventIdOf(url)
  if (!eventId) return empty()

  const html = await fetchText(url)
  const currency = currencyOf(html)
  const shapes = sectionShapes(html)
  if (!shapes.length) return empty()

  // A run plays several nights off one page; the pills switch which night's
  // availability the table describes. One night needs no second request.
  let data = parseSectionsData(html)
  const nights = parseDateButtons(html)
  const night = pickNight(nights, date)
  if (night && nights.length > 1) {
    const fresh = await salesSection(eventId, night.id)
    if (fresh) data = fresh
  }

  const zones = []
  const sections = []
  const legend = []
  for (const shape of shapes) {
    const record = data[shape.sid] || {}
    const offer = priceOf(record, currency)
    const seated = shape.seating === 'assigned'
    // No ticket type on a block means it is not being sold tonight — ihjoz greys
    // it out rather than removing it, and so do we.
    const inStock = Boolean(offer)
    sections.push({
      id: shape.sid,
      name: shape.name || offer?.name || shape.sid,
      kind: seated ? 'seats' : 'zone',
      color: cssColor(shape.color || record.color),
      price: offer?.price ?? 0,
      currency: offer?.currency || currency,
      inStock,
      min: offer?.min ?? 1,
      max: offer?.max ?? 10,
    })
    if (offer) legend.push({ price: offer.price, currency: offer.currency, color: cssColor(shape.color || record.color) })
    if (!seated) {
      zones.push({
        id: shape.sid,
        name: shape.name || offer?.name || shape.sid,
        price: offer?.price ?? 0,
        currency: offer?.currency || currency,
        inStock,
        // A table of four is min 4 / max 4: picking it is picking the table,
        // not a number of seats, and the hub renders that as one choice.
        min: offer?.min ?? 1,
        max: offer?.max ?? 10,
      })
    }
  }

  const svg = extractSvg(html)
  return {
    currency,
    zones,
    tiers: tiersFrom(legend.map((l) => ({ ...l, free: true, seats: 0, available: 0 }))),
    map: svg
      ? {
          viewBox: viewBoxOf(svg),
          svg: sanitizeSvg(svg.replace(/\bsid="/g, 'data-sid="')),
          sections,
        }
      : null,
    // Seats arrive per block, from loadSection.
    rows: [],
    totals: { seats: 0, available: 0 },
  }
}

/** The seats of one numbered block, drawn from that block's own SVG. */
export async function loadSection(url, sid, { date } = {}) {
  const eventId = eventIdOf(url)
  if (!eventId) return null

  const html = await fetchText(url)
  const currency = currencyOf(html)
  const shape = sectionShapes(html).find((s) => s.sid === sid)
  if (!shape || shape.seating !== 'assigned') return null

  let data = parseSectionsData(html)
  const nights = parseDateButtons(html)
  const night = pickNight(nights, date)
  if (night && nights.length > 1) {
    const fresh = await salesSection(eventId, night.id)
    if (fresh) data = fresh
  }

  const record = data[sid]
  if (!record?.id) return null
  const offer = priceOf(record, currency)
  const taken = new Set([...(record.unavailable_seats || []), ...(record.reserved_seats || [])])

  const name = shape.name || offer?.name || sid
  const svg = await fetchText(`${BASE}/sections/${encodeURIComponent(record.id)}/map`)
  const rows = buildRows(svg, sid, {
    price: offer?.price ?? 0,
    color: cssColor(shape.color || record.color),
    taken,
    // Carried onto every row so a chosen seat reads "Zone C — Row O" in the
    // WhatsApp message, the same as a box-office seat does.
    name,
  })

  const seats = rows.flatMap((r) => r.seats).filter((s) => s.state !== 'gap')
  return {
    section: { id: sid, name, price: offer?.price ?? 0, inStock: Boolean(offer) },
    currency: offer?.currency || currency,
    rows,
    tiers: tiersFrom(
      seats.map((s) => ({ price: s.price, currency: offer?.currency || currency, color: s.color, free: s.state === 'free' })),
    ),
    totals: { seats: seats.length, available: seats.filter((s) => s.state === 'free').length },
  }
}

/**
 * A block's SVG into rows.
 *
 * The seat id is `g<grid>-<row>-<column>`, which is the only reliable ordering:
 * the file lists each row right to left, and the label ("G-9") gives the row
 * letter and seat number but says nothing about where a missing seat was. So
 * rows are keyed on the row index, seats placed at their column index, and a
 * column nobody sold stays an empty slot — otherwise every seat after an aisle
 * slides one place left and the drawing stops matching the room.
 */
function buildRows(svg, sid, { price, color, taken, name }) {
  const byRow = new Map()
  let m
  SEAT_TAG.lastIndex = 0
  while ((m = SEAT_TAG.exec(svg))) {
    const tag = m[0]
    // A block's file only ever holds its own seats, but it says so on each one;
    // trust that over the file we asked for.
    if (attr(tag, 'section') !== sid) continue
    const id = attr(tag, 'id')
    const grid = id.match(/^g(\d+)-(\d+)-(\d+)$/)
    if (!grid) continue
    const rowIndex = Number(grid[2])
    const colIndex = Number(grid[3])
    const label = attr(tag, 'label')
    const dash = label.lastIndexOf('-')
    const rowLabel = dash > 0 ? label.slice(0, dash) : label
    const num = dash > 0 ? label.slice(dash + 1) : String(colIndex + 1)
    const row = byRow.get(rowIndex) || { index: rowIndex, label: rowLabel, seats: new Map() }
    row.label = row.label || rowLabel
    row.seats.set(colIndex, {
      num,
      price,
      color,
      state: taken.has(id) ? 'sold' : 'free',
    })
    byRow.set(rowIndex, row)
  }

  const rows = [...byRow.values()].sort((a, b) => a.index - b.index)
  if (!rows.length) return []

  // The column index is a position in the whole venue's grid, not in this
  // block — a block on the right of the hall starts at column 50 and would
  // otherwise be drawn with fifty empty slots in front of every row (one
  // theatre's blocks start at 50 for 64 seats: a map twice as wide as the seats
  // in it, most of it blank). So the whole block is shifted by the leftmost
  // column ANY of its rows uses. Shifting each row by its own would be worse
  // than the margin: rows would slide relative to each other and row K's seat 11
  // would no longer sit above row G's.
  const cols = rows.flatMap((r) => [...r.seats.keys()])
  const first = Math.min(...cols)
  const last = Math.max(...cols)

  return rows.map((row, i) => {
    const seats = []
    for (let c = first; c <= last; c++) {
      const seat = row.seats.get(c)
      seats.push(
        seat
          ? { id: `${i}-${c}`, ...seat }
          : { id: `${i}-${c}`, num: '', price: 0, color: '', state: 'gap' },
      )
    }
    return { id: `r${i}`, section: name, label: row.label, seats }
  })
}

/** Live availability for one night: `{ sectionsData: "<json string>" }`. */
async function salesSection(eventId, eventDateId) {
  try {
    const body = await fetchJson(
      `${BASE}/events/${encodeURIComponent(eventId)}/sales_section?event_date_id=${encodeURIComponent(eventDateId)}`,
      { headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: `${BASE}/events/${eventId}` } },
    )
    return typeof body?.sectionsData === 'string' ? JSON.parse(body.sectionsData) : null
  } catch {
    // The page's own copy is still a real answer, just for whichever night it
    // opened on — better than no map.
    return null
  }
}

function pickNight(nights, date) {
  if (!nights.length) return null
  const iso = String(date || '').slice(0, 10)
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return nights[0]
  const month = Number(m[2])
  const day = Number(m[3])
  return nights.find((n) => n.month === month && n.day === day) || nights[0]
}

const empty = () => ({ currency: 'USD', zones: [], tiers: [], map: null, rows: [], totals: { seats: 0, available: 0 } })
