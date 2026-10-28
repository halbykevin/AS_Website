// Where an event comes from: one of the ticketing sites the events sync reads,
// or AS Ticketing itself — an event AS hosts, made by hand in the admin.
//
// A deliberate mirror of as_ticketing/src/lib/sources.js, the ticketing hub's
// copy: the card, the event screen and the Events tab's Source filter all ask
// sourceOf(), as the hub's do, so an event is labelled the same on the phone as
// on ticketing.as.com.lb. Keep the two in step — a fifth sync site needs a row
// in both, or its events go unlabelled.
//
// On screen it is a name and nothing more, never a link: reserving is our
// WhatsApp, or the hub for an event AS hosts. The partner's own link appears
// only inside the WhatsApp message (eventRefs() in lib/whatsapp.js).

// In the order the filter shows them. `key` is the sync's (EVENT_SOURCES in
// server/src/scraper.js).
export const SOURCES = [
  { key: '', slug: 'as-ticketing', name: 'AS Ticketing', host: '' },
  { key: 'ticketingboxoffice', slug: 'ticketing-box-office', name: 'Ticketing Box Office', host: 'ticketingboxoffice.com' },
  { key: 'antoineticketing', slug: 'antoine', name: 'Antoine Ticketing', host: 'antoineticketing.com' },
  { key: 'tickit', slug: 'tickit', name: "Tick'it", host: 'tickit.co' },
  { key: 'ihjoz', slug: 'ihjoz', name: 'ihjoz', host: 'ihjoz.com' }
];

export const AS_TICKETING = SOURCES[0];

// React Native's URL can't be trusted for `hostname`, so — like lib/seatmap.js —
// the host is read with a pattern.
const hostOf = url => {
  const m = String(url || '').match(/^https?:\/\/([^/?#:]+)/i);
  return m ? m[1].toLowerCase() : '';
};

/**
 * The event's source, or null for a site this list doesn't name yet — better
 * no label than a raw sync key on the card.
 *
 * The site API sends `source`; an API from before that field is read from the
 * ticket link's host instead.
 */
export function sourceOf(event) {
  if (typeof event?.source === 'string') {
    return SOURCES.find(s => s.key === event.source) || null;
  }
  const host = hostOf(event?.ticketUrl);
  if (!host) return AS_TICKETING;
  return SOURCES.find(s => s.host && (host === s.host || host.endsWith(`.${s.host}`))) || null;
}
