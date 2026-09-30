// ---------------------------------------------------------------------------
// The crawler-facing text files — sitemap.xml, robots.txt and llms.txt —
// generated at build time by scripts/prerender.mjs from the same content the
// pages render, so they list what actually exists instead of what existed when
// someone last edited a file by hand. Build-only: nothing here reaches the
// browser bundle.
// ---------------------------------------------------------------------------

import { SITE_URL, absoluteUrl, prerenderRoutes, normalizePath } from './seo.js'
import { hoursSentence } from './hours.js'

const STORE_FALLBACK = 'https://store.as.com.lb'
const TICKETING_FALLBACK = 'https://ticketing.as.com.lb'

const isHttp = (v) => /^https?:\/\//i.test(String(v || ''))
const originOf = (url, fallback) => {
  try {
    return new URL(isHttp(url) ? url : fallback).origin
  } catch {
    return fallback
  }
}

const xmlEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Every pre-rendered public page — and only those. */
export function sitemapXml(c) {
  const urls = prerenderRoutes(c).map((r) => `  <url>\n    <loc>${xmlEscape(absoluteUrl(r.path))}</loc>\n  </url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated at build time by scripts/prerender.mjs from the live content.
     /events is absent on purpose: it 301s to the ticketing hub, whose own
     sitemap lists every event — ${originOf(c.ticketingUrl, TICKETING_FALLBACK)}/sitemap.xml -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
}

export function robotsTxt() {
  return `# Every crawler is welcome, AI and answer engines included — the public
# pages are pre-rendered, so they are readable without running JavaScript.
# A plain-text summary of the company for language models: ${SITE_URL}/llms.txt
User-agent: *
Allow: /
Disallow: /admin

Sitemap: ${SITE_URL}/sitemap.xml
`
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const sentence = (s) => {
  const t = clean(s)
  return t && !/[.!?…]$/.test(t) ? `${t}.` : t
}

/**
 * llms.txt (https://llmstxt.org): a Markdown briefing an answer engine can read
 * in one request — who the company is, what each of its three sites is for, and
 * the pages worth citing. Every statement comes from the content the site
 * itself publishes; nothing here is copy that exists only for machines.
 */
export function llmsTxt(c) {
  const brand = c.brand || {}
  const name = brand.name || 'AS Company'
  const legal = brand.legalName || ''
  const ww = c.whatWeDo || {}
  const contact = c.contact || {}
  const storeOrigin = originOf(c.store?.url, STORE_FALLBACK)
  const ticketingOrigin = originOf(c.ticketingUrl, TICKETING_FALLBACK)
  const solutions = (c.solutions || []).filter((s) => s && s.slug && s.visible !== false)
  const services = (c.services?.items || []).filter((s) => s && s.title)
  const divisions = Array.isArray(ww.divisions) ? ww.divisions : []
  const phone = String(c.whatsappNumber || '').replace(/\D/g, '')

  const out = []
  out.push(`# ${name}${legal ? ` (${legal})` : ''}`, '')
  if (brand.tagline) out.push(`> ${clean(brand.tagline)}`, '')

  out.push(
    `${name}${legal ? ` (${legal})` : ''} is a Lebanese company working in telecommunication, electronics and ` +
      `technology solutions. It runs three websites: this company site, the AS Store online shop, and the AS Ticketing ` +
      `Hub for events in Lebanon.`,
    '',
  )

  out.push('## Websites', '')
  out.push(
    `- [${name}](${absoluteUrl('/')}): The company site — what ${name} does, the ${clean(ww.title) || 'solutions'} ` +
      `division's technology, security and automation services, and how to get in touch.`,
  )
  out.push(
    `- [AS Store](${storeOrigin}/): Online shopping for tech and electronics, delivered across Lebanon. ` +
      `Delivery, returns and departments: ${storeOrigin}/llms.txt`,
  )
  out.push(
    `- [AS Ticketing Hub](${ticketingOrigin}/events): Events in Lebanon — concerts, comedy, theatre and festivals, ` +
      `reserved over WhatsApp. Current listings: ${ticketingOrigin}/llms.txt`,
  )
  out.push('')

  if (ww.enabled !== false && (ww.title || solutions.length)) {
    out.push(`## ${clean(ww.title) || 'What We Do'}`, '')
    for (const p of ww.intro || []) if (clean(p)) out.push(clean(p), '')
    if (solutions.length) {
      out.push(`### ${clean(ww.solutionsHeading) || 'Solutions'}`, '')
      for (const s of solutions) {
        const items = (s.items || []).map((it) => clean(it?.title)).filter(Boolean)
        const lead = sentence(s.summary || s.intro)
        out.push(
          `- [${clean(s.title)}](${absoluteUrl(`/what-we-do/${s.slug}`)}): ${lead}${
            items.length ? ` Covers: ${items.join(', ')}.` : ''
          }`,
        )
      }
      out.push('')
    }
    if (ww.vision) out.push(`**${clean(ww.visionHeading) || 'Vision'}:** ${clean(ww.vision)}`, '')
    if (ww.mission) out.push(`**${clean(ww.missionHeading) || 'Mission'}:** ${clean(ww.mission)}`, '')
    if (divisions.length) {
      out.push(`### ${clean(ww.divisionsHeading) || 'Divisions'}`, '')
      for (const d of divisions) if (d?.name) out.push(`- **${clean(d.name)}**: ${sentence(d.description)}`)
      out.push('')
    }
  }

  if (services.length) {
    out.push('## Areas of business', '')
    for (const s of services) out.push(`- **${clean(s.title)}**: ${sentence(s.description)}`)
    out.push('')
  }

  const shop = c.shop
  const hours = hoursSentence(shop?.hours)
  if (shop?.address || hours) {
    out.push('## Visit us', '')
    if (shop.address) out.push(`- **Address:** ${shop.name || 'AS Store'}, ${shop.address}`)
    if (hours) out.push(`- **Opening hours:** ${hours} (Lebanon time)`)
    if (shop.phone) out.push(`- **Shop phone:** ${shop.phone}`)
    out.push('')
  }

  out.push('## Contact', '')
  out.push(`- [Contact page](${absoluteUrl('/contact')}): WhatsApp, email, Instagram and a message form.`)
  out.push(`- [FAQ](${absoluteUrl('/faq')}): location, opening hours, solutions, shopping, events and contact.`)
  if (contact.email) out.push(`- Email: ${contact.email}`)
  if (phone) out.push(`- WhatsApp: +${phone} (https://wa.me/${phone})`)
  if (isHttp(contact.instagram)) {
    out.push(`- Instagram: ${contact.instagramHandle ? `${contact.instagramHandle} ` : ''}(${contact.instagram})`)
  }
  out.push('')

  out.push('## Pages', '')
  const titled = {
    '/': 'Home',
    '/what-we-do': clean(ww.title) || 'What We Do',
    '/contact': 'Contact',
    '/faq': 'FAQ',
  }
  for (const r of prerenderRoutes(c)) {
    const path = normalizePath(r.path)
    const solution = solutions.find((s) => `/what-we-do/${s.slug}` === path)
    out.push(`- [${titled[path] || clean(solution?.title) || path}](${absoluteUrl(path)})`)
  }
  out.push('')

  return out.join('\n')
}
