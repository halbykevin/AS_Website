// Central SEO configuration + structured-data builders for the ticketing hub.
//
// Everything that names or addresses this site derives from SITE_URL, so the
// canonicals, the sitemap, the OpenGraph tags and the JSON-LD can never drift
// apart. Set NEXT_PUBLIC_SITE_URL in the environment; the fallback is only so
// local builds don't crash.
//
// The reason this file exists at all: an event page's job in Google is to win
// the *event* rich result — the date/venue card, and the "Events" experience on
// Search and Maps — and that is driven entirely by schema.org/Event markup. No
// amount of good copy substitutes for it. See eventJsonLd below.

import { eventDateLabel, eventDays } from './events.js'

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://ticketing.as.com.lb'
).replace(/\/$/, '')

export const SITE_NAME = 'AS Ticketing Hub'
export const SITE_TAGLINE = 'Events in Lebanon — concerts, comedy, theatre & festivals'
export const LEGAL_NAME = 'Absolute Solutions SAL'

// Every event on this platform happens in Lebanon (the sync runs with
// --country Lebanon), which is what lets the country be a constant here.
const COUNTRY = 'LB'
const TZ = 'Asia/Beirut'

/** Absolute URL for a site-relative path (safe for canonicals / OG images). */
export const absoluteUrl = (path = '/') =>
  `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`

/** An image URL as the crawler must see it: absolute, whatever the source. */
export const absoluteImage = (src) =>
  !src ? '' : /^https?:\/\//i.test(src) ? src : absoluteUrl(src)

/**
 * Trim copy to a clean meta-description length (~160 chars) without cutting a
 * word in half. Strips HTML in case a scraped description carries markup.
 */
export function metaDescription(text, fallback = '') {
  const clean = String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const out = clean || String(fallback || '').replace(/\s+/g, ' ').trim()
  if (out.length <= 160) return out
  return `${out.slice(0, 157).replace(/\s+\S*$/, '')}…`
}

export const DEFAULT_OG_IMAGE = absoluteUrl('/as-ticketing-hub-logo.png')

/**
 * The shared OpenGraph image descriptor — dimensions included, so a crawler
 * doesn't have to fetch the file before it can lay the card out.
 */
export const DEFAULT_OG_IMAGES = [
  { url: DEFAULT_OG_IMAGE, width: 874, height: 723, alt: SITE_NAME },
]

// ---------------------------------------------------------------------------
// Dates
//
// Google reads Event.startDate as a machine date. A bare 'YYYY-MM-DD' is legal
// and is what we fall back to, but a date *with* a local time is what makes the
// result show "8:00 PM" rather than just the day — so the free-text `time` the
// box offices give us is parsed when it is parseable and ignored when it isn't.
// The zone offset is computed for the event's own date rather than hardcoded:
// Beirut is +02:00 in winter and +03:00 in summer, and a listing an hour out is
// worse than one with no time at all.
// ---------------------------------------------------------------------------

function parseTime(time) {
  const raw = String(time || '').trim()
  const hm = raw.match(/^(\d{1,2})\s*[:.]\s*(\d{2})\s*(am|pm)?/i)
  if (hm) {
    let h = Number(hm[1])
    const min = Number(hm[2])
    const mer = hm[3]?.toLowerCase()
    if (mer === 'pm' && h < 12) h += 12
    if (mer === 'am' && h === 12) h = 0
    if (h > 23 || min > 59) return null
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  // "8pm", "8 PM" — an hour with no minutes. Only with a meridiem: a bare "8"
  // could be either end of the day.
  const h12 = raw.match(/^(\d{1,2})\s*(am|pm)$/i)
  if (!h12) return null
  let h = Number(h12[1])
  if (h > 12) return null
  const mer = h12[2].toLowerCase()
  if (mer === 'pm' && h < 12) h += 12
  if (mer === 'am' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:00`
}

function zoneOffset(date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date(`${date}T12:00:00Z`))
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value || ''
    const m = raw.match(/GMT([+-]\d{2}:\d{2})/)
    return m ? m[1] : '+03:00'
  } catch {
    return '+03:00'
  }
}

/** 'YYYY-MM-DD' (+ a free-text time) -> an ISO 8601 start date. */
export function isoDateTime(date, time) {
  if (!date) return ''
  const hhmm = parseTime(time)
  return hhmm ? `${date}T${hhmm}:00${zoneOffset(date)}` : date
}

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

/** Site-wide Organization + WebSite, rendered once in the root layout. */
export function organizationJsonLd(settings = {}) {
  const sameAs = [settings.contactInstagram].filter(Boolean)
  const phone = settings.whatsappNumber || settings.contactWhatsapp
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: `AS Company (${settings.legalName || LEGAL_NAME})`,
        alternateName: SITE_NAME,
        url: SITE_URL,
        logo: DEFAULT_OG_IMAGE,
        areaServed: { '@type': 'Country', name: 'Lebanon' },
        ...(sameAs.length ? { sameAs } : {}),
        ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
        ...(phone ? { telephone: phone } : {}),
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_TAGLINE,
        inLanguage: 'en',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  }
}

/** Breadcrumb JSON-LD from an ordered [{ name, url }] trail. */
export function breadcrumbJsonLd(items = []) {
  if (!items.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.url),
    })),
  }
}

function placeOf(event, night = {}) {
  return {
    '@type': 'Place',
    name: night.venue || event.venue || event.city || 'Lebanon',
    address: {
      '@type': 'PostalAddress',
      ...(event.city ? { addressLocality: event.city } : {}),
      addressCountry: COUNTRY,
    },
  }
}

/**
 * schema.org/Event for one event page.
 *
 * A multi-night run is emitted as one Event **per night** rather than a single
 * Event spanning the range, because that is what Google indexes: each night is
 * a separate thing a person searches for and attends, and a ten-day span shown
 * as one entry is wrong on every day but the first. They share the page URL and
 * differ by @id — the shape Google documents for a page listing several dates
 * of the same show.
 *
 * `offers` deliberately carries no price. We don't know it — the box offices
 * price per tier and the sync never scrapes it — and a fabricated 0 would be a
 * misrepresentation in the one place Google checks against reality.
 */
export function eventJsonLd(event, { bookingUrl = '', past = false } = {}) {
  if (!event) return null
  const url = absoluteUrl(`/events/${event.slug}`)
  const image = absoluteImage(event.imageUrl)
  const description = metaDescription(
    event.excerpt || event.description,
    `${eventDateLabel(event)}${event.venue ? ` · ${event.venue}` : ''}`,
  )
  const nights = (event.dates || []).filter((d) => d?.date)
  const days = nights.length ? nights : eventDays(event).map((date) => ({ date }))

  const build = (night) => ({
    '@type': 'Event',
    '@id': `${url}#event${night.date ? `-${night.date}` : ''}`,
    name: event.title,
    url,
    ...(description ? { description } : {}),
    ...(image ? { image: [image] } : {}),
    ...(night.date ? { startDate: isoDateTime(night.date, night.time || event.time) } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: placeOf(event, night),
    organizer: { '@id': `${SITE_URL}/#organization` },
    ...(event.categoryName ? { keywords: event.categoryName } : {}),
    // A finished event still gets markup (the page stays up), but offering
    // tickets for it would be a lie.
    ...(past
      ? {}
      : {
          offers: {
            '@type': 'Offer',
            url: night.url || event.ticketUrl || bookingUrl || url,
            availability: 'https://schema.org/InStock',
          },
        }),
  })

  if (days.length <= 1) {
    return { '@context': 'https://schema.org', ...build(days[0] || {}) }
  }
  return { '@context': 'https://schema.org', '@graph': days.map(build) }
}

/** An ordered list of events, for the listing page. */
export function eventListJsonLd(events = [], { name, url } = {}) {
  if (!events.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    ...(name ? { name } : {}),
    ...(url ? { url: absoluteUrl(url) } : {}),
    numberOfItems: events.length,
    itemListElement: events.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluteUrl(`/events/${e.slug}`),
      name: e.title,
    })),
  }
}

/**
 * Ready for dangerouslySetInnerHTML. `<` is escaped so a scraped title
 * carrying markup can never close the script tag early.
 */
export const jsonLdScript = (obj) => ({
  __html: JSON.stringify(obj).replace(/</g, '\\u003c'),
})
