// Free-text search over the events the app already has in memory.
//
// There is no search endpoint to call, and deliberately so: the whole catalogue
// is a few hundred rows that every page already loads (lib/api.js holds them
// for five minutes), so matching them here is faster than a query parameter on
// the marketing site's API and a round trip per keystroke — and it keeps this
// app's "no backend of its own" rule intact.
//
// The same functions run in two places on purpose: the listing page filters the
// grid on the server, the search box ranks its suggestions on the client. A
// suggestion and the results page it leads to can therefore never disagree
// about what matches, which is the one way a search box loses a visitor's
// trust in a single tap.

import { eventDateLabel } from './events.js'

/**
 * Fold text down to something two spellings of the same name both reach:
 * lowercase, no accents (Béchara / Bechara), no markup (scraped descriptions
 * carry HTML), and punctuation flattened to spaces so "Fairuz: Live!" and
 * "fairuz live" meet in the middle. Arabic script is kept — a title written in
 * it has to stay searchable in it.
 */
export function normalize(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .trim()
}

/** The query as the words it actually asks for. */
export function searchTokens(query) {
  const words = normalize(query).split(' ').filter(Boolean)
  return words.slice(0, 8) // a paragraph pasted into the box is not a query
}

// What gets searched, and what a hit in each field is worth.
//
// Title leads by a wide margin: someone typing a name means the act, not a
// venue that happens to share a word with it. Description is searched last and
// only exists on the server's copy of an event — but it is where a line-up
// hides ("with special guest ..."), which is often the only place a supporting
// artist's name appears at all. That is also why the results grid can show
// matches the suggestion list didn't hint at, and why the box always offers
// "see all results" rather than claiming there is nothing.
const FIELDS = [
  ['title', 12],
  ['venue', 5],
  ['city', 5],
  ['categoryName', 4],
  ['excerpt', 2],
  ['description', 1],
]

// Normalising a description on every keystroke would be wasteful, and event
// objects are stable for as long as the page holds them — so fold each one once
// and hang the result off the object itself.
const FOLDED = new WeakMap()

function foldedFields(event) {
  if (!event || typeof event !== 'object') return []
  let fields = FOLDED.get(event)
  if (!fields) {
    fields = FIELDS.map(([key, weight]) => [normalize(event[key]), weight]).filter(([text]) => text)
    FOLDED.set(event, fields)
  }
  return fields
}

/**
 * How well one event answers the query. 0 means it doesn't: **every** word has
 * to land somewhere, because "elissa forum" is a request for one event, not for
 * everything named Elissa plus everything at the Forum.
 */
export function scoreEvent(event, tokens) {
  if (!tokens?.length) return 0
  const fields = foldedFields(event)
  let total = 0

  for (const token of tokens) {
    let best = 0
    for (const [text, weight] of fields) {
      const at = text.indexOf(token)
      if (at < 0) continue
      // Where a word landed matters as much as which field it landed in:
      // "mel" opening the title is the act someone meant, the same letters
      // buried inside another word ("caramel") is a coincidence worth ranking
      // below it — and a whole word beats the prefix of a much longer one.
      const edge = at === 0 ? 2 : text[at - 1] === ' ' ? 1.5 : 0.6
      const after = text[at + token.length]
      const whole = after === undefined || after === ' ' ? 1.2 : 1
      const score = weight * edge * whole
      if (score > best) best = score
    }
    if (!best) return 0
    total += best
  }

  return total
}

/**
 * The events that match, best first. An empty query returns the list untouched
 * — the caller's order (soonest first) is the right answer when nothing was
 * asked. Sorting is stable, so events that score the same stay in date order.
 */
export function searchEvents(events, query) {
  const tokens = searchTokens(query)
  if (!tokens.length) return events || []
  return (events || [])
    .map((event) => ({ event, score: scoreEvent(event, tokens) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.event)
}

/**
 * The smallest shape a suggestion can be rendered and matched from — this
 * crosses the server/client boundary as props on every listing page, so it
 * carries no descriptions and no image URLs. The date label is computed here
 * rather than shipped as raw dates: the client would only format it again.
 */
export function searchIndex(events) {
  return (events || []).map((e) => ({
    slug: e.slug,
    title: e.title || '',
    venue: e.venue || '',
    city: e.city || '',
    categoryName: e.categoryName || '',
    when: eventDateLabel(e),
  }))
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Split text into [{ text, hit }] so a suggestion can show which part of it the
 * visitor typed. Matching happens on the raw string rather than the folded one,
 * because folding changes the length and the offsets stop pointing at the
 * original — so an accented match simply isn't highlighted. Highlighting is
 * decoration: absent is fine here, wrong is not.
 */
export function highlightParts(text, tokens) {
  const src = String(text || '')
  const words = (tokens || []).filter(Boolean)
  if (!src || !words.length) return [{ text: src, hit: false }]

  const re = new RegExp(`(${words.map(escapeRe).join('|')})`, 'ig')
  const parts = []
  let last = 0
  for (const m of src.matchAll(re)) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index), hit: false })
    parts.push({ text: m[0], hit: true })
    last = m.index + m[0].length
  }
  if (last < src.length) parts.push({ text: src.slice(last), hit: false })
  return parts
}
