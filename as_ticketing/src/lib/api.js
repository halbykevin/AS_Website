// Everything this app shows comes from the marketing site's API — the same one
// as.com.lb reads. There is no database here, and deliberately no admin: events
// and categories are managed once, at as.com.lb/admin, and the events sync
// (three ticketing sites -> Postgres) keeps them current for both properties.

import { isEventPast } from './events.js'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

// Events change when someone runs the sync or edits one in the admin — minutes
// matter, seconds don't. A short revalidate keeps the platform fresh without
// hammering the API on every visit.
const REVALIDATE = 300

async function get(path, fallback) {
  try {
    const res = await fetch(`${API}${path}`, { next: { revalidate: REVALIDATE } })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.json()
  } catch (err) {
    // A dead API must not black out the site. Log it and render what we can —
    // the same call the marketing site makes with its static fallbacks.
    console.error(`[api] GET ${path} failed:`, err.message)
    return fallback
  }
}

const byDate = (a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999'))

/** Every event the API knows about, past included, soonest first. */
export async function getAllEvents() {
  const rows = await get('/api/events', [])
  return [...rows].sort(byDate)
}

/** Upcoming events, soonest first — what the listing and the sitemap show. */
export async function getEvents() {
  return (await getAllEvents()).filter((e) => !isEventPast(e))
}

/**
 * One event by slug, **including events that have already happened**.
 *
 * A page that Google has indexed must not turn into a 404 the morning after the
 * show: that throws away every link and every ranking signal the event earned,
 * and sends a visitor who searched for it to an error instead of to what else
 * is on. Past events keep their page, marked as finished and noindexed, and
 * drop out of the listing and the sitemap — which is the treatment Google's own
 * event documentation asks for.
 */
export async function getEvent(slug) {
  const rows = await getAllEvents()
  return rows.find((e) => e.slug === slug) || null
}

/** Only the categories that actually have an upcoming event behind them. */
export async function getCategories() {
  const [cats, events] = await Promise.all([get('/api/categories', []), getEvents()])
  const used = new Set(events.map((e) => e.categorySlug).filter(Boolean))
  return cats.filter((c) => c.visible !== false && used.has(c.slug))
}

export async function getSettings() {
  return get('/api/settings', {})
}
