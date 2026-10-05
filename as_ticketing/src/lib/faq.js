// The hub's FAQ (/faq) — how reserving works, what is listed, and who is behind
// it — answered from what the hub actually does.
//
// The booking answers describe the flow the event pages run (bookingUrl() in
// lib/events.js, the seat map's own "not held until we confirm" wording), the
// categories are the live ones, and the address and opening hours come from
// the AS Store admin through the site API's /api/shop. Nothing is typed for
// this page alone.
//
// One function feeds the page and its FAQPage structured data, so the markup
// is always exactly the questions and answers on screen.

import { reservationNumber } from './events.js'
import { hoursSentence } from './hours.js'

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const listOf = (items) =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] || ''

/** [{ id, q, a: [paragraph…], links: [{ href, label }] }] — `a` is plain text. */
export function hubFaq({ settings = {}, categories = [], shop = null } = {}) {
  const phone = reservationNumber(settings).replace(/\D/g, '')
  const legal = clean(settings.legalName) || 'Absolute Solutions SAL'
  const hours = hoursSentence(shop?.hours)
  // Catch-all buckets from the sync ("Events", "Other") say nothing as a kind.
  const kinds = categories
    .map((c) => clean(c.name).toLowerCase())
    .filter((n) => n && !/^(events?|other|misc(ellaneous)?)$/.test(n))

  const items = [
    {
      id: 'what',
      q: 'What is AS Ticketing Hub?',
      a: [
        `AS Ticketing Hub is the events platform of AS Company (${legal}). It lists what’s on across Lebanon — ` +
          'concerts, comedy, theatre, festivals and nights out — with a page for every event giving the date, the ' +
          'venue and how to reserve.',
      ],
      links: [{ href: '/events', label: 'Browse all events' }],
    },
    phone
      ? {
          id: 'reserve',
          q: 'How do I reserve tickets?',
          a: [
            'Open the event and tap Reserve. A WhatsApp chat with AS Company opens, already filled in with the ' +
              'event, the date and the venue — send it, and our team replies to confirm your reservation.',
          ],
        }
      : {
          id: 'reserve',
          q: 'How do I reserve tickets?',
          a: ['Open the event and follow its Reserve link to the event’s booking page.'],
        },
  ]

  if (phone) {
    items.push(
      {
        id: 'seats',
        q: 'Can I choose my seats?',
        a: [
          'Yes, when the venue publishes its seating. The event page then shows a live seat map where you can pick ' +
            'seats, a zone or a table, and your choice is sent to us on WhatsApp.',
        ],
      },
      {
        id: 'confirmed',
        q: 'Is my seat confirmed as soon as I send the message?',
        a: [
          'Not yet — a seat map choice is a request, not a booking. Seats are not held until we confirm them with ' +
            'the ticket office and reply on WhatsApp, and if a seat has gone in the meantime we will tell you.',
        ],
      },
    )
  }

  if (kinds.length) {
    items.push({
      id: 'categories',
      q: 'What kinds of events are listed?',
      a: [`Right now: ${listOf(kinds)} — across Lebanon, upcoming events only.`],
      links: [{ href: '/events', label: 'See what’s on' }],
    })
  }

  if (shop?.address || hours) {
    items.push({
      id: 'where',
      q: 'Where is AS Company, and when are you open?',
      a: [
        [
          shop?.address && `Our shop is ${shop.name || 'AS Store'} in ${shop.address}.`,
          hours && `Opening hours: ${hours}`,
        ]
          .filter(Boolean)
          .join(' '),
      ],
    })
  }

  items.push({
    id: 'contact',
    q: 'How do I contact you about an event?',
    a: [
      phone
        ? `Message us on WhatsApp at +${phone} — the Reserve button on any event does it for you, with the event already filled in.`
        : 'Use the contact page on as.com.lb.',
    ],
    links: [{ href: 'https://www.as.com.lb/contact', label: 'Contact AS Company' }],
  })

  return items
}

/** FAQPage structured data for the same list. */
export function faqJsonLd(items, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    ...(url ? { url } : {}),
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a.join(' ') },
    })),
  }
}
