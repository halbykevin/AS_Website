// The company FAQ (/faq) — the questions people ask about AS Company, answered
// from the site's own content.
//
// Every answer is assembled from what the site already states: the brand and
// divisions from Site Settings and What We Do, the solutions from their table,
// the address and opening hours from the AS Store admin (content.shop, relayed
// by /api/shop), the channels from Site Settings -> Contact. Nothing here is a
// fact typed for this page, so the FAQ cannot say something the rest of the
// site contradicts.
//
// One function feeds the page (pages/Faq.jsx) and its FAQPage JSON-LD
// (lib/seo.js): Google requires the markup to match what the page shows, and
// building both from one list is how they stay matched.

import { eventsHref } from '../components/EventsLink.jsx'
import { hoursSentence } from './hours.js'

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const stripDot = (s) => clean(s).replace(/[.\s]+$/, '')
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)
// The first sentence of an admin-written description, without its full stop.
const firstSentence = (s) => stripDot(clean(s).split(/(?<=[.!?])\s/)[0])
const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six']
const listOf = (items) =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] || ''
const hostOf = (url) => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/**
 * [{ id, q, a: [paragraph…], links: [{ href, label, external }] }] — `a` is
 * plain text: exactly what the page prints and what the markup says.
 */
export function siteFaq(c) {
  const brand = c.brand || {}
  const name = brand.name || 'AS Company'
  const legal = brand.legalName ? ` (${brand.legalName})` : ''
  const ww = c.whatWeDo || {}
  const shop = c.shop
  const contact = c.contact || {}
  const storeUrl = /^https?:\/\//i.test(c.store?.url || '') ? c.store.url : 'https://store.as.com.lb'
  const ticketing = /^https?:\/\//i.test(c.ticketingUrl || '') ? eventsHref(c.ticketingUrl) : ''
  const solutions = (c.solutions || []).filter((s) => s && s.slug && s.visible !== false)
  const divisions = (Array.isArray(ww.divisions) ? ww.divisions : []).filter((d) => d?.name)
  const phone = String(c.whatsappNumber || '').replace(/\D/g, '')
  const hours = hoursSentence(shop?.hours)

  const items = []

  items.push({
    id: 'what-we-do',
    q: `What does ${name} do?`,
    a: [
      `${name}${legal} — ${lowerFirst(stripDot(brand.tagline))}.`,
      divisions.length
        ? `It works through ${COUNT[divisions.length] || divisions.length} division${divisions.length === 1 ? '' : 's'}: ` +
          `${listOf(divisions.map((d) => (d.description ? `${clean(d.name)} (${firstSentence(d.description)})` : clean(d.name))))}.`
        : '',
    ].filter(Boolean),
    links: [{ href: '/what-we-do', label: 'What we do' }],
  })

  if (shop?.address) {
    items.push({
      id: 'location',
      q: `Where is ${name} located?`,
      a: [`You can visit us at ${shop.name || 'AS Store'} in ${shop.address}.`],
    })
  }

  if (hours) {
    items.push({
      id: 'hours',
      q: 'What are your opening hours?',
      a: [`${hours} All times are Lebanon time.`],
    })
  }

  if (solutions.length) {
    items.push({
      id: 'solutions',
      q: 'What business solutions do you offer?',
      a: [
        `Through ${clean(ww.title) || 'our solutions division'}, we provide ` +
          `${listOf(solutions.map((s) => clean(s.title)))} for businesses across Lebanon.`,
      ],
      links: [{ href: '/what-we-do', label: 'See every solution' }],
    })
  }

  items.push({
    id: 'shop-online',
    q: 'Where can I buy electronics online?',
    a: [
      `At AS Store (${hostOf(storeUrl)}), our online shop for tech and electronics — it delivers anywhere in Lebanon.`,
    ],
    links: [{ href: storeUrl, label: 'Visit AS Store', external: true }],
  })

  if (ticketing) {
    items.push({
      id: 'events',
      q: 'How do I reserve a spot at an event?',
      a: [
        phone
          ? `Find the event on AS Ticketing Hub (${hostOf(ticketing)}) and tap Reserve: a WhatsApp chat with us opens, ` +
            'already filled in with the event, and our team replies to confirm your spot.'
          : `Find the event on AS Ticketing Hub (${hostOf(ticketing)}) — each event page links to where you can book.`,
      ],
      links: [{ href: ticketing, label: 'Browse events' }],
    })
  }

  const channels = [
    phone && `WhatsApp: +${phone}`,
    contact.email && `Email: ${clean(contact.email)}`,
    contact.instagramHandle && /^https?:\/\//i.test(contact.instagram || '') && `Instagram: ${clean(contact.instagramHandle)}`,
  ].filter(Boolean)
  items.push({
    id: 'contact',
    q: `How can I contact ${name}?`,
    a: [
      channels.length
        ? `${channels.join(' · ')}. You can also send us a message from our contact page.`
        : 'Send us a message from our contact page.',
    ],
    links: [{ href: '/contact', label: 'Contact us' }],
  })

  return items
}
