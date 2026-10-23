// Booking tickets on an event AS Company hosts — the one thing this app sends
// to the site API rather than only reading from it (server/src/bookings.js).
//
// A booking holds the seats for 24 hours. It is paid online (Whish, the same
// account as store.as.com.lb) or in cash at AS Company; unpaid, it expires and
// the seats go back on sale on their own. The server prices everything and is
// the only judge of whether a seat is still free.

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

async function send(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong — please try again.')
    err.status = res.status
    err.taken = data.taken || []
    err.reload = Boolean(data.reload || data.taken)
    throw err
  }
  return data
}

/** -> { code, token, status, link, collectUrl, onlineError } */
export const createBooking = (slug, body) =>
  send(`/api/events/${encodeURIComponent(slug)}/bookings`, { method: 'POST', body })

export const bookingPath = (code, token) => `/bookings/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}`

/** The booking as its owner sees it, or null. Server-side, never cached. */
export async function getBooking(code, token) {
  try {
    return await send(`/api/bookings/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}`)
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
}

/** -> { collectUrl } — the Whish page for a reservation. */
export const payOnline = (code, token) =>
  send(`/api/bookings/${encodeURIComponent(code)}/pay?t=${encodeURIComponent(token)}`, { method: 'POST' })
