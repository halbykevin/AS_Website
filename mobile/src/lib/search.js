// The app's half of the AS Store search: the tokenizer the suggestion rows
// highlight against, and the list of searches this phone remembers.
//
// A deliberate copy of as_store/src/lib/search.js, the way the two cart slices
// mirror each other — same minimum query, same tokens, same six remembered
// searches, because both talk to the same /api/search/suggest and a customer
// who searches on the website and then in the app must be answered the same
// way. What differs is only the plumbing: recents live in AsyncStorage rather
// than localStorage, and the fetching and caching are React Query's job (see
// useSuggestions in lib/queries.js) rather than a hand-rolled Map.

import { storage, KEYS } from './storage';

// Below this the panel shows its idle face (recent searches + categories)
// instead of firing a request at every keystroke.
export const MIN_QUERY = 2;

export const EMPTY_RESULT = { query: '', products: [], categories: [], brands: [], total: 0 };

export const normalizeQuery = q =>
  String(q || '')
    .trim()
    .replace(/\s+/g, ' ');

// Words worth highlighting in a hit. Mirrors the API's tokenizer: split on
// whitespace, then trim punctuation off each end so "wheel," still matches.
export function queryTokens(q) {
  return normalizeQuery(q)
    .split(' ')
    .map(t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
    .slice(0, 6);
}

/* ---- Recent searches ---------------------------------------------------- */

const RECENT_MAX = 6;

export async function readRecent() {
  const raw = await storage.getJSON(KEYS.recentSearches, []);
  return Array.isArray(raw) ? raw.filter(s => typeof s === 'string' && s.trim()).slice(0, RECENT_MAX) : [];
}

// Returns the new list so a caller can paint it without a second read. Writes
// are best-effort: recents are a nicety, and a storage failure must never stop
// a search from running.
export async function pushRecent(q) {
  const term = normalizeQuery(q);
  if (!term) return readRecent();
  const rest = (await readRecent()).filter(s => s.toLowerCase() !== term.toLowerCase());
  const next = [term, ...rest].slice(0, RECENT_MAX);
  await storage.setJSON(KEYS.recentSearches, next);
  return next;
}

export async function removeRecent(q) {
  const next = (await readRecent()).filter(s => s !== q);
  await storage.setJSON(KEYS.recentSearches, next);
  return next;
}

export async function clearRecent() {
  await storage.setJSON(KEYS.recentSearches, []);
  return [];
}
