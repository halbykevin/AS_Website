// Client-side search helpers shared by the ⌘K search dialog and the search
// page: the suggest fetcher (debounce/abort friendly, with a session cache),
// the query tokenizer the highlighter marks against, and the recent-searches
// list. Pure helpers + fetch — imported from client components only.

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

// Under this many characters the dialog shows its idle panel (recent searches +
// categories) instead of firing a request on every keystroke.
export const MIN_QUERY = 2

export const EMPTY_RESULT = { query: '', products: [], categories: [], brands: [], total: 0 }

export const normalizeQuery = (q) => String(q || '').trim().replace(/\s+/g, ' ')

// Words worth highlighting in a hit. Mirrors the API's tokenizer: split on
// whitespace, then trim punctuation off each end so "wheel," still matches.
export function queryTokens(q) {
  return normalizeQuery(q)
    .split(' ')
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
    .slice(0, 6)
}

// Session cache — backspacing through a query re-renders instantly instead of
// re-hitting the API. Bounded so a long browsing session can't grow it forever.
const cache = new Map()
const CACHE_MAX = 50

function remember(key, value) {
  cache.set(key, value)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  return value
}

// Lets the dialog paint a cached page of results before the debounce fires, so
// results never flash empty while retyping.
export function cachedSuggestions(q) {
  const term = normalizeQuery(q)
  if (term.length < MIN_QUERY) return null
  return cache.get(term.toLowerCase()) || null
}

const asArray = (v) => (Array.isArray(v) ? v : [])

const shape = (query, data) => ({
  query,
  products: asArray(data?.products),
  categories: asArray(data?.categories),
  brands: asArray(data?.brands),
  total: Number(data?.total) || asArray(data?.products).length,
})

// One round-trip for products + categories + brands. Falls back to the plain
// product list if the deployed API predates /api/search/suggest, so a frontend
// release can never get ahead of the API.
export async function fetchSuggestions(q, { signal, limit = 6 } = {}) {
  const term = normalizeQuery(q)
  if (term.length < MIN_QUERY) return { ...EMPTY_RESULT, query: term }
  const key = term.toLowerCase()
  const hit = cache.get(key)
  if (hit) return hit

  const qs = `q=${encodeURIComponent(term)}&limit=${limit}`
  const res = await fetch(`${API}/api/search/suggest?${qs}`, { signal })
  if (res.ok) return remember(key, shape(term, await res.json()))
  if (res.status !== 404) throw new Error(`Search failed (HTTP ${res.status})`)

  const legacy = await fetch(
    `${API}/api/products?search=${encodeURIComponent(term)}&limit=${limit}`,
    { signal },
  )
  if (!legacy.ok) throw new Error(`Search failed (HTTP ${legacy.status})`)
  return remember(key, shape(term, { products: await legacy.json() }))
}

/* ---- Recent searches (localStorage) ------------------------------------ */

const RECENT_KEY = 'as-store:recent-searches'
const RECENT_MAX = 6

export function readRecent() {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((s) => typeof s === 'string' && s.trim()).slice(0, RECENT_MAX) : []
  } catch {
    return [] // private mode / corrupted value — recents are a nicety, not a feature to crash on
  }
}

function writeRecent(list) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    /* quota or private mode — keep the in-page list working anyway */
  }
  return list
}

export function pushRecent(q) {
  const term = normalizeQuery(q)
  if (!term) return readRecent()
  const rest = readRecent().filter((s) => s.toLowerCase() !== term.toLowerCase())
  return writeRecent([term, ...rest].slice(0, RECENT_MAX))
}

export function removeRecent(q) {
  return writeRecent(readRecent().filter((s) => s !== q))
}

export function clearRecent() {
  return writeRecent([])
}
