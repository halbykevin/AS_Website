// Live seat maps for the events our sync lists.
//
// All four ticketing sites publish, to an anonymous browser, everything needed
// to draw the hall an event is playing in and what is still free in it. So this
// reads that on demand and hands the ticketing hub a map it can draw, and the
// visitor picks their seats and sends them to us on WhatsApp.
//
//   ticketingboxoffice.com  every seat is an <input> in the page → seatmap/tbo.js
//   ihjoz.com               an SVG of the room + a table of blocks → seatmap/ihjoz.js
//   tickit.co               an SVG of the room + zones from their API → seatmap/tickit.js
//   antoineticketing.com    a seating plan of coordinates + categories → seatmap/antoine.js
//
// The four answer in one shape (see the route below) so the hub has one thing
// to render: an optional drawing, optional rows of numbered seats, and the
// zones. What each source can fill in differs and that is real, not a gap —
// tickit sells zones with free seating inside them, so there are no seats to
// pick; ihjoz has both, and loads a block's seats when you open it.
//
// What this is NOT, and cannot be: a booking. Nothing here reserves anything —
// only the partner's own system can hold a seat. Two visitors can pick the same
// seat a second apart, and a seat can sell between the fetch and the message.
// That is understood and handled by a person: staff confirm every request on
// WhatsApp and come back to the customer if a seat is gone. The UI says so in
// as many words; do not let it start claiming otherwise.
//
// Freshness is the other half of that bargain — hence the on-demand fetch with
// a short cache rather than anything stored in our database. A seat map saved
// by the nightly sync would be hours stale, which is a different and much worse
// lie than "as of a minute ago".

import express from 'express'
import { query } from './db.js'
import { hostOf } from './seatmap/http.js'
import * as tbo from './seatmap/tbo.js'
import * as ihjoz from './seatmap/ihjoz.js'
import * as tickit from './seatmap/tickit.js'
import * as antoine from './seatmap/antoine.js'

export const seatmapRouter = express.Router()

// One kill switch. If a partner objects, or redesigns and a parser starts
// returning nonsense, set SEATMAP_ENABLED=0 and the hub quietly goes back to
// the plain "Reserve on WhatsApp" button. `SEATMAP_SOURCES=tbo,ihjoz` turns off
// one source without turning off the rest.
const ENABLED = process.env.SEATMAP_ENABLED !== '0'

const ALL = [tbo, ihjoz, tickit, antoine]
const ONLY = String(process.env.SEATMAP_SOURCES || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

const SOURCES = ONLY.length
  ? ALL.filter((s) => ONLY.includes(s.KEY) || (s === tbo && ONLY.includes('tbo')))
  : ALL

// Only ever fetch a partner we know how to read, and only a URL that is already
// stored on the event being asked about — never a URL from the query string.
// That is what keeps this from being an open proxy.
function sourceFor(url) {
  const host = hostOf(url)
  return SOURCES.find((s) => s.HOSTS.has(host)) || null
}

export const isSeatmapUrl = (url) => Boolean(sourceFor(url))

const CACHE_TTL_MS = 60_000
const CACHE_MAX = 60

// key -> { at, data }
const cache = new Map()

function cacheGet(key) {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.data
}

function cacheSet(key, data) {
  cache.set(key, { at: Date.now(), data })
  // Oldest-first eviction; Map keeps insertion order.
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
}

/**
 * The event row, and the one URL we are allowed to read for the night asked
 * for. `date` picks one night of a run — at the box office and on tickit each
 * night is its own page, so the URL itself changes; ihjoz sells every night off
 * one page and the source module switches nights on its own.
 *
 * `time` is not decoration: a run can play twice in a day (the ten-night
 * stand-up run this was written against sells a 6pm and a 9pm on the same
 * Saturday, as two separate halls), and a date on its own would always load the
 * earlier one and quietly offer seats from the wrong show.
 */
async function resolve(slug, wantedDate, wantedTime) {
  const { rows } = await query(
    'SELECT id, slug, title, venue, city, ticket_url, dates FROM events WHERE slug = $1',
    [slug],
  )
  const ev = rows[0]
  if (!ev) return null

  const dates = Array.isArray(ev.dates) ? ev.dates : []
  const wanted = String(wantedDate || '').slice(0, 10)
  const time = String(wantedTime || '').slice(0, 16)
  const sameDay = wanted ? dates.filter((d) => String(d?.date || '').slice(0, 10) === wanted) : []
  const night = (time && sameDay.find((d) => d?.time === time)) || sameDay[0] || null
  const url = (night?.url || ev.ticket_url || dates.find((d) => d?.url)?.url || '').trim()
  return { event: ev, url, night, date: night?.date || wanted || null }
}

function reasonFor(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'timeout'
  if (err instanceof TypeError || /HTTP \d+|bad JSON/.test(err?.message || '')) return 'unreachable'
  return null
}

// ------------------------------------------------------------------ routes ---

// GET /api/events/:slug/seatmap?date=YYYY-MM-DD&time=HH:MM
//
// Public, like the rest of the events API — this is what the hub's event page
// draws for a visitor.
//
//   { available, source, date, currency,
//     map:   { viewBox, svg, sections[] } | null,   the partner's own drawing
//     rows:  [{ id, section, label, seats[] }],     numbered seats, if any
//     zones: [{ id, name, price, inStock, min, max }],
//     tiers: [{ price, color, seats, available }],
//     totals:{ seats, available } }
seatmapRouter.get('/:slug/seatmap', async (req, res, next) => {
  try {
    if (!ENABLED) return res.json({ available: false, reason: 'disabled' })

    const found = await resolve(req.params.slug, req.query.date, req.query.time)
    if (!found) return res.status(404).json({ error: 'Not found' })

    const source = sourceFor(found.url)
    if (!source) {
      // Hand-made events, and anything sold somewhere we have no reader for.
      // Not an error — the hub just shows its usual reserve button.
      return res.json({ available: false, reason: 'unsupported' })
    }

    const key = `${source.KEY}|${found.url}|${found.date || ''}`
    const cached = cacheGet(key)
    const data = cached || (await source.load(found.url, { date: found.date }))
    if (!cached && (data.rows.length || data.zones.length)) cacheSet(key, data)

    if (!data.rows.length && !data.zones.length) {
      // No `url` here: this endpoint is public, and the partner's page for the
      // night is exactly what a visitor must never be handed.
      return res.json({ available: false, reason: 'empty' })
    }
    // A minute is how long the cached copy lives; let a CDN or browser hold it
    // for the same span rather than re-asking on every keystroke of a resize.
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
    res.json({ available: true, source: source.KEY, date: found.date, cached: Boolean(cached), ...data })
  } catch (err) {
    const reason = reasonFor(err)
    if (!reason) return next(err)
    if (reason === 'unreachable') console.warn(`[seatmap] ${req.params.slug}: ${err.message}`)
    res.json({ available: false, reason })
  }
})

// GET /api/events/:slug/seatmap/sections/:sid?date=YYYY-MM-DD&time=HH:MM
//
// The seats inside one block of a map that has blocks (ihjoz). Separate because
// a hall can have six of them and most visitors open one: loading all six with
// the map would be 200 KB nobody asked for.
seatmapRouter.get('/:slug/seatmap/sections/:sid', async (req, res, next) => {
  try {
    if (!ENABLED) return res.json({ available: false, reason: 'disabled' })

    const found = await resolve(req.params.slug, req.query.date, req.query.time)
    if (!found) return res.status(404).json({ error: 'Not found' })

    const source = sourceFor(found.url)
    if (!source?.loadSection) return res.json({ available: false, reason: 'unsupported' })

    const sid = String(req.params.sid).slice(0, 64)
    const key = `${source.KEY}|${found.url}|${found.date || ''}|${sid}`
    const cached = cacheGet(key)
    const data = cached || (await source.loadSection(found.url, sid, { date: found.date }))
    if (!data?.rows?.length) return res.json({ available: false, reason: 'empty' })
    if (!cached) cacheSet(key, data)

    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
    res.json({ available: true, source: source.KEY, date: found.date, ...data })
  } catch (err) {
    const reason = reasonFor(err)
    if (!reason) return next(err)
    if (reason === 'unreachable') console.warn(`[seatmap] ${req.params.slug}/${req.params.sid}: ${err.message}`)
    res.json({ available: false, reason })
  }
})
