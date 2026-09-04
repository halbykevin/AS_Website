// tickit.co — a venue drawing plus the zones on sale in it.
//
// Tick'it has no numbered seats to pick, and that is their product rather than
// a gap in ours: their own ticket note says "free seating within your selected
// zone, allocated on a first-come, first-seated basis". So the map is the
// choice — front, middle, back, benches — and the quantity follows it.
//
// Two anonymous reads: the same JSON API the site's own browser bundle calls
// (one POST returns the event with its tickets, their live wave prices and how
// many are left), and the venue SVG the event points at, whose zone groups
// carry `data-zone` matching each ticket's `svgZoneID`. Nothing is stored: a
// wave sells out between two page loads.
//
// A run is several events here — the ten-night stand-up run this was written
// against is ten event ids, one per night — so the night's own id comes from
// the URL on that night's row and each night reports its own availability.

import { cssColor, fetchJson, fetchText, tiersFrom } from './http.js'
import { extractSvg, sanitizeSvg, viewBoxOf } from './svg.js'

export const KEY = 'tickit'
export const HOSTS = new Set(['tickit.co', 'www.tickit.co'])

const API = 'https://us-central1-ticket-development-6f3af.cloudfunctions.net/api/events/get-events'

// The token tickit.co ships to every visitor in its own bundle. Read-only: this
// endpoint lists what the site already shows on the page.
const API_TOKEN =
  'ZEdsamEybDBYMkZ3YVE9PTpkR2xqYTJsMFgyRndhVjl3WVhOemQyOXlaRjhrSkNSZlpHVjJjdz09ZGtsd29zc3h3ZD1hcw=='

// Their maps are published to Firebase Storage. Only that host, so a changed
// field on their side can never point this at somewhere else.
const SVG_HOSTS = new Set(['firebasestorage.googleapis.com'])

const eventIdOf = (url) => (String(url).match(/\/events\/([A-Za-z0-9_-]+)/) || [])[1] || ''

export async function load(url) {
  const eventID = eventIdOf(url)
  if (!eventID) return empty()

  const payload = await fetchJson(API, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + API_TOKEN,
      'Content-Type': 'application/json',
      Origin: 'https://tickit.co',
      Referer: 'https://tickit.co/',
    },
    body: JSON.stringify({ source: 'tickit.co', eventID }),
  })
  const list = payload?.data?.data ?? payload?.data ?? []
  const event = (Array.isArray(list) ? list : [list])[0]
  if (!event || event.eventID !== eventID) return empty()

  // Tickets live in three places depending on how the organiser built the
  // event; all three are the same shape and any of them can carry a zone.
  const tickets = [
    ...(event.tickets || []),
    ...(event.groups || []).flatMap((g) => g?.tickets || []),
    ...(event.seatingTickets || []),
  ].filter((t) => t && !t.isHidden)

  const currency = tickets.find((t) => t.currency)?.currency || event.ticketsCurrency || 'USD'
  const zones = tickets.map((t, i) => zoneOf(t, i, currency)).filter(Boolean)
  if (!zones.length) return empty()

  const map = event.isSvgVenueMapFlow ? await loadMap(event.venueMapSvgUrl, zones) : null

  return {
    currency,
    zones,
    // `free: true` on purpose: the drawing paints a sold-out zone in its own
    // colour rather than greying it, so the legend swatch stays truthful even
    // when nothing in that zone is left. (The box office does grey its sold
    // seats, which is why its tiers only trust free ones.)
    tiers: tiersFrom(zones.map((z) => ({ price: z.price, currency: z.currency, color: colorFor(map, z.id), free: true }))),
    map,
    // No numbered seats exist to draw. The hub falls back to its zone list,
    // which here is the whole choice rather than a consolation.
    rows: [],
    totals: { seats: 0, available: 0 },
  }
}

/**
 * The wave a visitor would actually be buying from.
 *
 * A ticket is sold in waves (early bird, then the rest), each with its own
 * window and price. The one on sale now is the one to quote; if none is, the
 * last one is what the page shows, greyed out.
 */
function currentWave(sales) {
  const waves = (sales || []).filter(Boolean)
  if (!waves.length) return null
  const now = Date.now() / 1000
  const open = waves.find(
    (w) =>
      String(w.waveStatus || '').toLowerCase() === 'available' &&
      (!w.from?._seconds || w.from._seconds <= now) &&
      (!w.till?._seconds || w.till._seconds >= now),
  )
  return open || waves[waves.length - 1]
}

function zoneOf(ticket, i, fallbackCurrency) {
  const wave = currentWave(ticket.sales)
  if (!wave) return null
  const price = Number(wave.customerPrice ?? wave.basePrice) || 0
  const left = Number(wave.quantity) || 0
  const min = Number(wave.minPerOrder) || 1
  const max = Number(wave.maxPerOrder) || 0
  return {
    // The zone id is what ties a row to a shape on the drawing; a ticket with
    // no zone still sells, it just isn't on the map.
    id: ticket.svgZoneID || `t${i}`,
    name: (ticket.name || '').replace(/\s+/g, ' ').trim() || `Ticket ${i + 1}`,
    price,
    currency: ticket.currency || fallbackCurrency,
    // Their own two conditions: the wave is open, and there is something left.
    // A wave can read "sold out" with stock behind it — that is the sale window
    // having closed, and it is still not on sale.
    inStock: String(wave.waveStatus || '').toLowerCase() === 'available' && left > 0,
    min,
    max: Math.max(min, Math.min(max || 10, left || 10)),
    left,
  }
}

async function loadMap(url, zones) {
  try {
    const host = new URL(String(url)).hostname.toLowerCase()
    if (!SVG_HOSTS.has(host)) return null
    const file = await fetchText(url)
    const svg = extractSvg(file)
    if (!svg) return null
    // Their zone groups are addressed by `data-zone`; ours by `data-sid`, the
    // same attribute ihjoz's blocks get, so the hub has one thing to look for.
    const inner = sanitizeSvg(svg.replace(/\bdata-zone="/g, 'data-sid="'))
    if (!inner) return null
    const known = new Set([...inner.matchAll(/data-sid="([^"]*)"/g)].map((m) => m[1]))
    const palette = zoneColors(inner)
    return {
      viewBox: viewBoxOf(svg),
      svg: inner,
      sections: zones
        .filter((z) => known.has(z.id))
        .map((z) => ({
          id: z.id,
          name: z.name,
          kind: 'zone',
          // The API has no colour for a zone; the drawing does, and the legend
          // is only readable if its swatch is the colour on the map.
          color: palette.get(z.id) || '',
          price: z.price,
          currency: z.currency,
          inStock: z.inStock,
          min: z.min,
          max: z.max,
        })),
    }
  } catch {
    // The zone list on its own is a working picker; the drawing is what makes
    // it obvious which one is near the stage.
    return null
  }
}

const colorFor = (map, id) => map?.sections?.find((s) => s.id === id)?.color || ''

/**
 * The fill each zone is painted with, read off the drawing.
 *
 * A zone is one <g data-sid="…">…</g> and the first solid fill inside it is the
 * block's colour; white and "none" are the card the shapes sit on.
 */
function zoneColors(inner) {
  const out = new Map()
  const re = /<g\b[^>]*data-sid="([^"]*)"[^>]*>([\s\S]*?)<\/g>/gi
  let m
  while ((m = re.exec(inner))) {
    if (out.has(m[1])) continue
    const fill = [...m[2].matchAll(/fill="([^"]*)"/gi)]
      .map((f) => f[1].trim())
      .find((f) => f && !/^(none|transparent|#fff(fff)?|white)$/i.test(f))
    if (fill) out.set(m[1], cssColor(fill))
  }
  return out
}

const empty = () => ({ currency: 'USD', zones: [], tiers: [], map: null, rows: [], totals: { seats: 0, available: 0 } })

// Kept for symmetry with the other sources: tickit has no numbered seats, so
// there is never a block to open.
export const loadSection = async () => null
