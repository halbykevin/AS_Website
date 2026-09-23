// The website's half of the AS Store search: the request, the tokenizer the
// suggestion rows highlight against, and the searches this browser remembers.
//
// A deliberate copy of as_store/src/lib/search.js (and mobile/src/lib/search.js)
// — same minimum query, same tokens, same six remembered searches — because all
// three end at the store's /api/search/suggest, and a customer who searches in
// the app and then here must be answered the same way. What differs is the
// plumbing: requests go through this site's own API (/api/store-search), which
// relays them to the store and hands back no prices (see server/src/app.js).

import { API_URL } from './api.js'

// Below this the panel shows its idle face (recent searches + categories)
// instead of firing a request at every keystroke.
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

/* ---- Requests ------------------------------------------------------------ */

// Session cache — backspacing through a query repaints instantly instead of
// asking again. Bounded so a long visit can't grow it for ever.
const cache = new Map()
const CACHE_MAX = 50

export function cachedSuggestions(q) {
  const term = normalizeQuery(q)
  return term.length < MIN_QUERY ? null : cache.get(term.toLowerCase()) || null
}

export async function fetchSuggestions(q, { signal, limit = 6 } = {}) {
  const term = normalizeQuery(q)
  if (term.length < MIN_QUERY) return { ...EMPTY_RESULT, query: term }
  const key = term.toLowerCase()
  if (cache.has(key)) return cache.get(key)

  const res = await fetch(`${API_URL}/api/store-search?q=${encodeURIComponent(term)}&limit=${limit}`, { signal })
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`)
  const data = await res.json()
  const list = (v) => (Array.isArray(v) ? v : [])
  const result = {
    query: term,
    products: list(data?.products),
    categories: list(data?.categories),
    brands: list(data?.brands),
    total: Number(data?.total) || 0,
  }
  cache.set(key, result)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  return result
}

// The store's top-level departments, for the panel before anything is typed.
// Fetched once per visit and only when the box is first opened.
let popular = null
export function fetchPopularCategories() {
  if (!popular) {
    popular = fetch(`${API_URL}/api/store-search/categories`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => (Array.isArray(rows) ? rows : []))
      .catch(() => {
        popular = null // let the next open try again
        return []
      })
  }
  return popular
}

/* ---- Where a result leads -------------------------------------------------- */

// The same destinations as the store's own search dialog. A brand has a real
// page on the website (the shop's brand filter), unlike in the app.
export const storeLinks = (base) => {
  const root = String(base || '').replace(/\/$/, '')
  return {
    search: (text) => `${root}/search?q=${encodeURIComponent(text)}`,
    product: (p, term) => (p.slug ? `${root}/product/${p.slug}` : `${root}/search?q=${encodeURIComponent(term)}`),
    category: (c) => `${root}/category/${c.slug}`,
    brand: (b) => `${root}/shop?brand=${encodeURIComponent(b.slug)}`,
  }
}

/* ---- Recent searches (localStorage) --------------------------------------- */

const RECENT_KEY = 'as:store-recent-searches'
const RECENT_MAX = 6

export function readRecent() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((s) => typeof s === 'string' && s.trim()).slice(0, RECENT_MAX) : []
  } catch {
    return [] // private mode / a corrupted value — recents are a nicety
  }
}

function writeRecent(list) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    /* quota or private mode — the in-page list still works */
  }
  return list
}

export function pushRecent(q) {
  const term = normalizeQuery(q)
  if (!term) return readRecent()
  const rest = readRecent().filter((s) => s.toLowerCase() !== term.toLowerCase())
  return writeRecent([term, ...rest].slice(0, RECENT_MAX))
}

export const clearRecent = () => writeRecent([])
