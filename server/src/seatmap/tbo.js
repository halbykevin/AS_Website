// ticketingboxoffice.com — the hall as server-rendered HTML.
//
// An event page renders every seat as a plain <input class="CellBtnClass">
// carrying its section, row, number, price, ticket category, colour and — the
// part that matters — whether it is still free (`CellBtnClassAv` +
// data-reservable="1"). Below the hall it lists every zone with its price and
// stock. All of it comes back from one anonymous GET: no API key, no cookies,
// no JavaScript.
//
// This one is rebuilt rather than redrawn: the page has no venue drawing to
// take, the seats come out in the hall's own left-to-right order, and a grid
// built from that is easier to tap than their table would be. The other two
// sources publish an actual SVG and are handled the other way round.

import { fetchText, parseMoney, tiersFrom } from './http.js'

export const KEY = 'ticketingboxoffice'
export const HOSTS = new Set(['ticketingboxoffice.com', 'www.ticketingboxoffice.com'])

// Every seat is a self-closing <input> whose attributes hold the whole record,
// and document order is the hall's own order — so the layout can be rebuilt
// without parsing the (deeply nested, generated) table around them.
const SEAT_TAG = /<input\b[^>]*class="[^"]*CellBtnClass[^"]*"[^>]*>/gi

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))
  return m ? m[1].trim() : ''
}

// "background-color:rgb( 0,100,150);" -> "rgb(0,100,150)"
function parseColor(style) {
  const m = String(style || '').match(/background-color\s*:\s*(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i)
  if (!m) return ''
  return m[1].replace(/\s+/g, '')
}

// The zone list under the hall: name, price and whether anything is left. It is
// the one part every event has — including the ones with no numbered seats at
// all (a class, a standing gig), which is why the hub can still offer a
// zone-and-quantity choice when there is no seat grid to draw.
function parseZones(html) {
  const byIndex = new Map()
  const re = /ListofZones_ctl(\d+)_(\w+)"[^>]*?(?:value="([^"]*)")?[^>]*>([\s\S]{0,400}?)</gi
  let m
  while ((m = re.exec(html))) {
    const [, idx, field, value, text] = m
    const rec = byIndex.get(idx) || {}
    rec[field] = (value ?? text ?? '').replace(/<[^>]*>/g, '').trim()
    byIndex.set(idx, rec)
  }
  const zones = []
  for (const [idx, rec] of byIndex) {
    const name = (rec.lblZoneDesc || '').replace(/\s+/g, ' ').trim()
    const price = parseMoney(rec.lblPrice)
    if (!name && !price.amount) continue
    zones.push({
      id: `z${idx}`,
      name,
      price: price.amount,
      currency: price.currency,
      // The box office's own "is there stock" flag. It is a coarse yes/no, not
      // a count — treat it as "worth asking about", never as a guarantee.
      inStock: rec.HiddenInStockServerSide !== '0',
      min: 1,
      max: 10,
    })
  }
  return zones
}

function parseSeats(html) {
  const seats = []
  let m
  SEAT_TAG.lastIndex = 0
  while ((m = SEAT_TAG.exec(html))) {
    const tag = m[0]
    const cls = attr(tag, 'class')
    const price = parseMoney(attr(tag, 'data-price') || attr(tag, 'data-initialprice'))
    const num = attr(tag, 'data-seatnum') || attr(tag, 'data-seat')
    // A price of zero with no hover behaviour is not a seat: it is the aisle
    // the hall leaves between blocks. Kept in place — dropping it would slide
    // every seat after it one position to the left and the map would stop
    // matching the room.
    const isGap = !price.amount || !/HoverSeat/i.test(cls)
    seats.push({
      section: (attr(tag, 'data-section') || attr(tag, 'data-divisionname') || '').replace(/\s+/g, ' ').trim(),
      row: (attr(tag, 'data-row') || '').replace(/\s+/g, ' ').trim(),
      num,
      price: price.amount,
      currency: price.currency,
      category: attr(tag, 'data-ticketcategory'),
      color: parseColor(attr(tag, 'style')),
      free: /CellBtnClassAv/i.test(cls) && attr(tag, 'data-reservable') !== '0',
      gap: isGap,
    })
  }
  return seats
}

// Group the flat seat list back into the hall: one entry per (section, row), in
// the order the page listed them, seats left to right.
function buildRows(seats) {
  const rows = []
  const index = new Map()
  for (const s of seats) {
    const key = `${s.section} ${s.row}`
    let row = index.get(key)
    if (!row) {
      row = { section: s.section, label: s.row, seats: [] }
      index.set(key, row)
      rows.push(row)
    }
    row.seats.push(s)
  }
  return rows
}

export function parseSeatmap(html) {
  const seats = parseSeats(html)
  const zones = parseZones(html)
  const real = seats.filter((s) => !s.gap)
  const rows = buildRows(seats).map((row, i) => ({
    id: `r${i}`,
    section: row.section,
    label: row.label,
    seats: row.seats.map((s, j) => ({
      // Stable within one map: what the hub uses as a React key and as the id
      // of a selected seat.
      id: `${i}-${j}`,
      num: s.gap ? '' : s.num,
      price: s.gap ? 0 : s.price,
      color: s.gap ? '' : s.color,
      state: s.gap ? 'gap' : s.free ? 'free' : 'sold',
    })),
  }))
  const currency = real.find((s) => s.currency)?.currency || zones.find((z) => z.currency)?.currency || 'USD'
  return {
    currency,
    zones,
    tiers: tiersFrom(seats),
    map: null,
    // A hall with no free seat left is still worth drawing — it is the answer
    // to "can I still get in", and the zone list may offer another block. But a
    // row of pure aisle is dropped: the box office uses those to hold the space
    // of a zone it hasn't loaded (one venue reserved 22 blank rows above the
    // block it did load) and to space out lounge tables, and drawing them is 22
    // empty labelled lines above the seats you came to pick.
    rows: rows.filter((r) => r.seats.some((s) => s.state !== 'gap')),
    totals: { seats: real.length, available: real.filter((s) => s.free).length },
  }
}

export async function load(url) {
  return parseSeatmap(await fetchText(url))
}
