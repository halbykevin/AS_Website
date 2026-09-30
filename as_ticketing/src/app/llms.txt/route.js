// /llms.txt (https://llmstxt.org) — what's on, in one Markdown file an AI
// answer engine can read in a single request: every upcoming event with its
// date, venue and page, the categories, and how reserving works.
//
// It reads the same getEvents() the listing and the sitemap read, so it lists
// exactly what the site does — upcoming only; a finished event keeps its page
// but leaves every list, this one included.

import { getCategories, getEvents, getSettings, getShop } from '@/lib/api'
import { eventDateLabel } from '@/lib/events'
import { COMPANY_URL, SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/seo'
import { hoursSentence } from '@/lib/hours'

// The listing's own cadence (lib/api.js revalidates every 5 minutes).
export const revalidate = 300

const clean = (s) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export async function GET() {
  const [events, categories, settings, shop] = await Promise.all([getEvents(), getCategories(), getSettings(), getShop()])
  const phone = String(settings.whatsappNumber || '').replace(/\D/g, '')

  const out = []
  out.push(`# ${SITE_NAME}`, '', `> ${SITE_TAGLINE}.`, '')
  out.push(
    `${SITE_NAME} is the events platform of AS Company (${clean(settings.legalName) || 'Absolute Solutions SAL'}) ` +
      `— ${COMPANY_URL}/. It lists upcoming concerts, comedy, theatre, festivals and more across Lebanon, and ` +
      'each event has its own page with the date, venue and details.',
    '',
  )

  out.push('## How reserving works', '')
  if (phone) {
    out.push(
      `- Every event page has a Reserve button that opens a WhatsApp chat with AS Company (+${phone}), ` +
        'pre-filled with the event, the date and the venue.',
    )
    out.push(
      '- Where the venue publishes its seating, the page shows a live seat map: choose seats, a zone or a table, ' +
        'and the choice is sent on WhatsApp. It is a request, not a booking — seats are not held until the team ' +
        'confirms them with the ticket office and replies.',
    )
  } else {
    out.push("- Every event page links to the event's own booking page.")
  }
  out.push('')

  if (categories.length) {
    out.push('## Categories', '')
    for (const c of categories) {
      const n = events.filter((e) => e.categorySlug === c.slug).length
      out.push(`- [${clean(c.name)}](${SITE_URL}/events?category=${encodeURIComponent(c.slug)}): ${n} upcoming`)
    }
    out.push('')
  }

  out.push(`## Upcoming events (${events.length})`, '')
  if (!events.length) out.push(`Nothing is listed right now — see ${SITE_URL}/events for the latest.`)
  for (const e of events) {
    const where = [clean(e.venue), clean(e.city)].filter(Boolean).join(', ')
    const bits = [
      eventDateLabel(e),
      clean(e.time),
      where,
      clean(e.categoryName),
    ].filter(Boolean)
    out.push(`- [${clean(e.title)}](${SITE_URL}/events/${e.slug})${bits.length ? `: ${bits.join(' · ')}` : ''}`)
  }
  out.push('')

  const hours = hoursSentence(shop?.hours)
  if (shop?.address || hours) {
    out.push('## Visit AS Company', '')
    if (shop?.address) out.push(`- **Address:** ${shop.name || 'AS Store'}, ${shop.address}`)
    if (hours) out.push(`- **Opening hours:** ${hours} (Lebanon time)`)
    out.push('')
  }

  out.push('## Related', '')
  out.push(`- [All events](${SITE_URL}/events)`)
  out.push(`- [FAQ](${SITE_URL}/faq): how reserving and seat requests work.`)
  out.push(`- [AS Company](${COMPANY_URL}/): the parent company — ${COMPANY_URL}/llms.txt`)
  out.push('- [AS Store](https://store.as.com.lb/): online shopping for tech & electronics in Lebanon.')
  out.push('')

  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
