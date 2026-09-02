// Everything this app shows comes from the marketing site's API — the same one
// as.com.lb reads. There is no database here, and deliberately no admin: events
// and categories are managed once, at as.com.lb/admin, and the events sync
// (three ticketing sites -> Postgres) keeps them current for both properties.

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

const isPast = (event) => {
  const days = (event.dates || []).map((d) => d.date).filter(Boolean)
  const last = days.length ? days.sort().at(-1) : event.date
  return Boolean(last) && last < new Date().toISOString().slice(0, 10)
}

/** Upcoming events, soonest first. */
export async function getEvents() {
  const rows = await get('/api/events', [])
  return rows
    .filter((e) => !isPast(e))
    .sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')))
}

export async function getEvent(slug) {
  const rows = await getEvents()
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
