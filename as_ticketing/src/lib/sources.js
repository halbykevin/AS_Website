// Where an event comes from: one of the ticketing sites the events sync reads,
// or AS Ticketing itself — an event AS hosts, made by hand in the admin at
// as.com.lb.
//
// The card, the event page and the /events?source= filter all ask sourceOf(),
// so a listing can never be labelled one thing and filed under another.
//
// On the page it is a name and nothing more, never a link: reserving is still
// our WhatsApp, whatever the label says. The partner's own link appears only
// inside the WhatsApp message (eventRefs() in lib/events.js).

// In the order the filter shows them. `key` is the sync's (EVENT_SOURCES in
// server/src/scraper.js); `slug` is what the URL carries, and `aliases` are
// slugs it used to carry, so a link shared before a rename still filters.
//
// The mobile app keeps a copy (mobile/src/lib/sources.js) — keep the two in
// step, or an event is labelled one thing on the phone and another here.
export const SOURCES = [
  { key: '', slug: 'as-ticketing', aliases: ['as-company'], name: 'AS Ticketing', host: '' },
  { key: 'ticketingboxoffice', slug: 'ticketing-box-office', name: 'Ticketing Box Office', host: 'ticketingboxoffice.com' },
  { key: 'antoineticketing', slug: 'antoine', name: 'Antoine Ticketing', host: 'antoineticketing.com' },
  { key: 'tickit', slug: 'tickit', name: "Tick'it", host: 'tickit.co' },
  { key: 'ihjoz', slug: 'ihjoz', name: 'ihjoz', host: 'ihjoz.com' },
]

export const AS_TICKETING = SOURCES[0]

/**
 * The event's source, or null for a site this list doesn't name yet — better
 * no label than a raw sync key on the card.
 *
 * The site API sends `source`; an API from before that field is read from the
 * ticket link's host instead, so the labels are right whichever of the two is
 * deployed first.
 */
export function sourceOf(event) {
  if (typeof event?.source === 'string') {
    return SOURCES.find((s) => s.key === event.source) || null
  }
  const host = hostOf(event?.ticketUrl)
  if (!host) return AS_TICKETING
  return SOURCES.find((s) => s.host && (host === s.host || host.endsWith(`.${s.host}`))) || null
}

export function sourceBySlug(slug) {
  return SOURCES.find((s) => s.slug === slug || s.aliases?.includes(slug)) || null
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}
