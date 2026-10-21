import { timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'

import { API_TAG } from '@/lib/api'

// POST /api/revalidate — the site API calls this when an event is published,
// unpublished or edited (server/src/hubRevalidate.js), so the change is on the
// hub at the next request instead of when the five-minute cache runs out.
//
// It drops every cached read of the site API at once: the listing, the event
// pages, the sitemap. Bearer REVALIDATE_SECRET only — open, it would let anyone
// make every visitor's page a fresh round trip to the API. Unset = refused.

const SECRET = process.env.REVALIDATE_SECRET || ''

function authorized(req) {
  const given = Buffer.from(req.headers.get('authorization') || '')
  const wanted = Buffer.from(`Bearer ${SECRET}`)
  return Boolean(SECRET) && given.length === wanted.length && timingSafeEqual(given, wanted)
}

export async function POST(req) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  revalidateTag(API_TAG)
  return Response.json({ revalidated: true })
}
