'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { initAnalytics, pageView, analyticsReady } from '@/lib/analytics'

// Loads the Google tag and reports every route change as a page view.
//
// The IDs come from admin settings, so an empty/disabled configuration renders
// nothing at all — no script, no requests, no cookies.
//
// afterInteractive, not lazyOnload: the tag has to run early enough to capture
// the `gclid` on an ad click and write the attribution cookie. A visitor who
// lands from an ad and leaves within a couple of seconds would otherwise arrive
// with no click ID attached, and the order they place later would look organic.
export default function Analytics({ tracking }) {
  const pathname = usePathname()

  // Queue `js` + `config` during render (not in an effect) so they are in the
  // dataLayer ahead of any event a child page fires on mount. useState's lazy
  // initialiser is the sanctioned way to run this exactly once.
  useState(() => initAnalytics(tracking))

  // Settings can change between navigations (an admin saves, the cache purges);
  // keep the module config in step without re-initialising the queue.
  useEffect(() => {
    initAnalytics(tracking)
  }, [tracking])

  // One page_view per route. Query-string-only changes (shop filters) are
  // deliberately not page views.
  useEffect(() => {
    if (!pathname) return
    pageView(pathname)
  }, [pathname])

  const id = tracking?.ga4Id || tracking?.adsConversionId
  if (!analyticsReady() || !id) return null

  // One gtag.js load serves both products; the `config` commands above decide
  // which of them receive the data.
  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
}
