import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useContent } from '../store/content.jsx'
import { applyHead, routeHead } from '../lib/seo.js'

// Keeps <title>, the meta description, canonical, OpenGraph and JSON-LD in step
// with the route as a visitor navigates. The pre-rendered HTML already carries
// the first page's head (scripts/prerender.mjs writes it from the same
// routeHead()), so on a hydrated page the first run changes nothing — it
// matters from the first client-side navigation on, and on pages that were not
// pre-rendered (admin, anything unknown).
//
// Waits for real content: while the site is still loading, a head built from
// the static defaults would say "Coming Soon" for a moment on every page.
export default function RouteHead() {
  const { pathname } = useLocation()
  const content = useContent()
  const { loading } = content

  useEffect(() => {
    if (loading) return
    applyHead(routeHead(pathname, content), content)
    // `content` is a fresh object each render; what the head reads from it only
    // changes when the provider's state does, which `loading` + the pieces
    // below track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pathname,
    loading,
    content.published,
    content.brand,
    content.whatWeDo,
    content.solutions,
    content.contact,
    content.faviconUrl,
    content.ticketingUrl,
    content.shop,
  ])

  return null
}
