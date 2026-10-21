// Tells the ticketing hub to drop its cached copy of the events the moment one
// changes here, so "Publish" in the admin means live now — not "within five
// minutes", which is how long the hub otherwise keeps what it read
// (as_ticketing/src/lib/api.js). The hub side is as_ticketing/src/app/api/revalidate.
//
// HUB_REVALIDATE_URL  https://ticketing.as.com.lb/api/revalidate
// HUB_REVALIDATE_SECRET  the same value as REVALIDATE_SECRET on the hub's Vercel project
//
// Unset = nothing is sent and the hub catches up on its own clock. A failure is
// logged and never fails the admin's write: the change is saved either way.

const URL_ = process.env.HUB_REVALIDATE_URL || ''
const SECRET = process.env.HUB_REVALIDATE_SECRET || ''

export const hubRevalidateEnabled = () => Boolean(URL_ && SECRET)

/** true when the hub confirmed it will serve fresh events on its next request. */
export async function revalidateHub(reason) {
  if (!hubRevalidateEnabled()) return false
  try {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return true
  } catch (err) {
    console.warn(`[hub] revalidate after ${reason} failed: ${err.message}`)
    return false
  }
}
