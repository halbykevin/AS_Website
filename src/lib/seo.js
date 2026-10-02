// ---------------------------------------------------------------------------
// SEO + structured data for as.com.lb, in one place.
//
// Two consumers read this module and must never disagree:
//   - scripts/prerender.mjs, which writes each public route's <head> into the
//     static HTML at build time (what crawlers — and AI crawlers, which do not
//     run JavaScript — actually read), and
//   - <RouteHead> (components/RouteHead.jsx), which keeps the same tags in step
//     as a visitor navigates client-side.
//
// Everything that names or addresses the site derives from SITE_URL. It is the
// www host because that is the one that answers: the bare domain 308s to www
// (Vercel's domain settings), and a canonical, sitemap or og:url pointing at a
// redirect is a signal Google has to second-guess. To move to the bare domain,
// flip the redirect in Vercel and set VITE_SITE_URL in the same change.
// ---------------------------------------------------------------------------

import { eventsHref } from '../components/EventsLink.jsx'
import { openingHoursJsonLd } from './hours.js'
import { siteFaq } from './faq.js'

export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://www.as.com.lb').replace(/\/+$/, '')

// The sister properties. Their own markup declares these same @ids (see
// as_store/src/lib/seo.js and as_ticketing/src/lib/seo.js), which is what lets
// a search or answer engine treat three domains as one company.
const STORE_FALLBACK = 'https://store.as.com.lb'
const TICKETING_FALLBACK = 'https://ticketing.as.com.lb'

export const ORG_ID = `${SITE_URL}/#organization`
export const WEBSITE_ID = `${SITE_URL}/#website`

const isHttp = (v) => /^https?:\/\//i.test(String(v || ''))
const originOf = (url, fallback) => {
  try {
    return new URL(isHttp(url) ? url : fallback).origin
  } catch {
    return fallback
  }
}

/** Absolute URL for a site path. '/' stays '/', everything else loses a trailing slash. */
export const absoluteUrl = (path = '/') => {
  const p = normalizePath(path)
  return p === '/' ? `${SITE_URL}/` : `${SITE_URL}${p}`
}

/** An image as a crawler must see it: absolute, whatever the source. */
export const absoluteAsset = (src) =>
  !src ? '' : isHttp(src) ? src : `${SITE_URL}${String(src).startsWith('/') ? '' : '/'}${src}`

export function normalizePath(pathname = '/') {
  const p = String(pathname || '/').split(/[?#]/)[0].replace(/\/+$/, '')
  return p || '/'
}

/** Trim copy to ~160 chars on a word boundary; strips any markup first. */
export function metaDescription(text, fallback = '') {
  const clean = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const out = clean(text) || clean(fallback)
  if (out.length <= 160) return out
  return `${out.slice(0, 157).replace(/\s+\S*$/, '')}…`
}

const stripDot = (s) => String(s || '').trim().replace(/[.\s]+$/, '')

/** '96176123923' -> '+96176123923'. Empty when there is no number. */
const e164 = (digits) => {
  const d = String(digits || '').replace(/\D/g, '')
  return d ? `+${d}` : ''
}

/**
 * The founding year, read from the content rather than typed here: the
 * "Established" stat when there is one, else the "since 2008" in the tagline.
 */
function foundingYear(c) {
  const stat = (c.about?.stats || []).find((s) => /establish|found/i.test(s?.label || ''))
  if (/^\d{4}$/.test(String(stat?.value || '').trim())) return String(stat.value).trim()
  const m = String(c.brand?.tagline || '').match(/since\s+(\d{4})/i)
  return m ? m[1] : ''
}

// Lebanon's governorates, as an address names them ("North Lebanon", "Mount
// Lebanon", "Bekaa"…). The one that ends an address is its addressRegion.
const GOVERNORATE =
  /^((north|south|mount) lebanon|north|south|beirut|bekaa|akkar|nabatieh|baalbek[- ]hermel|keserwan[- ]jbeil)( governorate)?$/i

/**
 * The shop's address (one free-text field in the AS Store admin) as a
 * PostalAddress, read the way Lebanese addresses are written — "village, town,
 * governorate[, Lebanon]", e.g. "Kferhata, Zgharta, North Lebanon".
 *
 * A deliberate copy of postalAddress() in as_store/src/lib/seo.js: both sites
 * describe the same shop under the same @id, so they must parse it the same.
 */
export function postalAddress(text = '') {
  const parts = String(text)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length > 1 && /^leban(on|ese republic)$/i.test(parts[parts.length - 1])) parts.pop()
  const region = parts.length > 1 && GOVERNORATE.test(parts[parts.length - 1]) ? parts.pop() : ''
  const locality = parts.pop()
  return {
    '@type': 'PostalAddress',
    ...(parts.length ? { streetAddress: parts.join(', ') } : {}),
    ...(locality ? { addressLocality: locality } : {}),
    ...(region ? { addressRegion: region } : {}),
    addressCountry: 'LB',
  }
}

const visibleSolutions = (c) => (c.solutions || []).filter((s) => s && s.slug && s.visible !== false)

const unique = (list) => [...new Set(list.filter(Boolean))]

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

/**
 * The physical shop, as a LocalBusiness — address, phone, opening hours.
 *
 * Its @id is the store's (`https://store.as.com.lb/#shop`), and the store's own
 * markup declares the same node from the same settings (as_store/src/lib/seo.js
 * shopJsonLd), so the two sites describe one place rather than two. Omitted
 * until the AS Store admin has an address to state.
 */
export function shopJsonLd(c) {
  const shop = c.shop
  if (!shop?.address) return null
  const storeOrigin = originOf(c.store?.url, STORE_FALLBACK)
  const hours = openingHoursJsonLd(shop.hours)
  return {
    '@type': 'ElectronicsStore',
    '@id': `${storeOrigin}/#shop`,
    name: shop.name || 'AS Store',
    url: `${storeOrigin}/faq`,
    image: `${storeOrigin}/as-store-logo.png`,
    address: postalAddress(shop.address),
    ...(shop.phone ? { telephone: shop.phone } : {}),
    ...(shop.email ? { email: shop.email } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    areaServed: { '@type': 'Country', name: 'Lebanon' },
    parentOrganization: { '@id': ORG_ID },
  }
}

/**
 * The company — the node every page of all three sites points back to.
 *
 * Only what the content actually says is stated. There is no street address or
 * opening hours in any admin setting, so there are none here: an invented one
 * would be the kind of claim Google checks and an answer engine repeats.
 */
export function organizationJsonLd(c) {
  const { brand = {}, contact = {}, store = {}, whatWeDo = {} } = c
  const email = contact.email || ''
  const telephone = e164(c.whatsappNumber)
  const storeOrigin = originOf(store.url, STORE_FALLBACK)
  const ticketingOrigin = originOf(c.ticketingUrl, TICKETING_FALLBACK)
  const founded = foundingYear(c)
  const shop = shopJsonLd(c)
  const divisions = Array.isArray(whatWeDo.divisions) ? whatWeDo.divisions : []
  const divisionText = (name) =>
    divisions.find((d) => String(d?.name || '').toLowerCase() === String(name).toLowerCase())?.description || ''

  const knowsAbout = unique([
    ...((c.services?.items || []).map((s) => s?.title)),
    ...visibleSolutions(c).map((s) => s.title),
  ])

  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: brand.name,
    ...(brand.legalName ? { legalName: brand.legalName, alternateName: brand.legalName } : {}),
    url: `${SITE_URL}/`,
    ...(brand.logo
      ? { logo: { '@type': 'ImageObject', url: absoluteAsset(brand.logo) }, image: absoluteAsset(brand.logo) }
      : {}),
    ...(brand.tagline ? { description: brand.tagline, slogan: brand.tagline } : {}),
    ...(founded ? { foundingDate: founded } : {}),
    areaServed: { '@type': 'Country', name: 'Lebanon' },
    // The shop's address is the company's: the AS Store admin holds it.
    address: shop ? shop.address : { '@type': 'PostalAddress', addressCountry: 'LB' },
    ...(shop ? { location: { '@id': shop['@id'] } } : {}),
    ...(email ? { email } : {}),
    ...(telephone ? { telephone } : {}),
    ...(email || telephone
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer service',
            ...(email ? { email } : {}),
            ...(telephone ? { telephone } : {}),
            areaServed: 'LB',
            url: absoluteUrl('/contact'),
          },
        }
      : {}),
    ...(isHttp(contact.instagram) ? { sameAs: [contact.instagram] } : {}),
    ...(knowsAbout.length ? { knowsAbout } : {}),
    ...(whatWeDo.enabled !== false && whatWeDo.title
      ? {
          department: {
            '@type': 'Organization',
            '@id': `${absoluteUrl('/what-we-do')}#division`,
            name: whatWeDo.title,
            url: absoluteUrl('/what-we-do'),
            ...(divisionText(whatWeDo.title) ? { description: divisionText(whatWeDo.title) } : {}),
          },
        }
      : {}),
    subOrganization: [
      {
        '@type': 'Organization',
        '@id': `${storeOrigin}/#organization`,
        name: store.title || 'AS Store',
        url: storeOrigin,
        ...(divisionText('AS Store') ? { description: divisionText('AS Store') } : {}),
      },
      {
        '@type': 'Organization',
        '@id': `${ticketingOrigin}/#organization`,
        name: 'AS Ticketing Hub',
        url: ticketingOrigin,
        description: 'Events in Lebanon — concerts, comedy, theatre and festivals, reserved over WhatsApp.',
      },
    ],
  }
}

function websiteJsonLd(c) {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: c.brand?.name || 'AS Company',
    ...(c.brand?.legalName ? { alternateName: c.brand.legalName } : {}),
    inLanguage: 'en',
    publisher: { '@id': ORG_ID },
  }
}

function webPage(type, { url, title, description, breadcrumb, about = true }) {
  return {
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name: title,
    ...(description ? { description } : {}),
    inLanguage: 'en',
    isPartOf: { '@id': WEBSITE_ID },
    ...(about ? { about: { '@id': ORG_ID } } : {}),
    ...(breadcrumb ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
  }
}

function breadcrumbJsonLd(url, trail) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: trail.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  }
}

function serviceJsonLd(s, { full = false } = {}) {
  const url = absoluteUrl(`/what-we-do/${s.slug}`)
  const items = (s.items || []).filter((it) => it && it.title)
  return {
    '@type': 'Service',
    '@id': `${url}#service`,
    name: s.title,
    url,
    ...(s.summary || s.intro ? { description: metaDescription(full ? s.intro || s.summary : s.summary || s.intro) } : {}),
    serviceType: s.title,
    provider: { '@id': ORG_ID },
    areaServed: { '@type': 'Country', name: 'Lebanon' },
    ...(s.image ? { image: absoluteAsset(s.image) } : {}),
    ...(full && items.length
      ? {
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: s.title,
            itemListElement: items.map((it) => ({
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: it.title,
                ...(it.description ? { description: it.description } : {}),
              },
            })),
          },
        }
      : {}),
  }
}

const graph = (nodes) => ({ '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) })

// ---------------------------------------------------------------------------
// Per-route head
// ---------------------------------------------------------------------------

/**
 * Everything a route puts in <head>: { title, description, canonical, robots,
 * image, imageAlt, jsonLd }. `c` is the site content (useContent()'s shape).
 */
export function routeHead(pathname, c) {
  const path = normalizePath(pathname)
  const brand = c.brand || {}
  const name = brand.name || 'AS Company'
  const org = organizationJsonLd(c)
  const website = websiteJsonLd(c)
  const shop = shopJsonLd(c)
  const logo = absoluteAsset(brand.logo)
  const base = { robots: '', image: logo, imageAlt: `${name} logo`, type: 'website' }

  if (path === '/admin' || path.startsWith('/admin/')) {
    return { ...base, title: `Admin — ${name}`, description: '', canonical: '', robots: 'noindex, nofollow', jsonLd: null }
  }

  // Unpublished: every route renders Coming Soon. Say so, and point everything
  // at the homepage rather than letting N identical pages compete.
  if (!c.published) {
    return {
      ...base,
      title: `${name} — Coming Soon`,
      description: metaDescription(`${name} (${brand.legalName}) — ${stripDot(brand.tagline)}. New website coming soon.`),
      canonical: absoluteUrl('/'),
      jsonLd: graph([org, website, shop]),
    }
  }

  if (path === '/') {
    const url = absoluteUrl('/')
    const title = `${name} — Telecommunication & Electronics in Lebanon`
    const description = metaDescription(
      `${stripDot(brand.tagline)} — shop at AS Store, book events, and explore IT, security & automation solutions.`,
    )
    return {
      ...base,
      title,
      description,
      canonical: url,
      jsonLd: graph([org, website, shop, webPage('WebPage', { url, title, description })]),
    }
  }

  const ww = c.whatWeDo || {}
  const wwTitle = ww.title || 'What We Do'

  if (path === '/what-we-do') {
    const url = absoluteUrl(path)
    const title = `${wwTitle} — IT, Security & Automation in Lebanon | ${name}`
    const description = metaDescription((ww.intro || []).join(' '), c.services?.subheading)
    const solutions = visibleSolutions(c)
    return {
      ...base,
      title,
      description,
      canonical: url,
      jsonLd: graph([
        org,
        website,
        shop,
        webPage('AboutPage', { url, title, description, breadcrumb: true }),
        breadcrumbJsonLd(url, [
          { name, path: '/' },
          { name: wwTitle, path },
        ]),
        solutions.length && {
          '@type': 'ItemList',
          '@id': `${url}#solutions`,
          name: ww.solutionsHeading || 'Our Solutions',
          numberOfItems: solutions.length,
          itemListElement: solutions.map((s, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: serviceJsonLd(s),
          })),
        },
      ]),
    }
  }

  const solutionMatch = path.match(/^\/what-we-do\/([^/]+)$/)
  if (solutionMatch) {
    const s = visibleSolutions(c).find((x) => x.slug === decodeURIComponent(solutionMatch[1]))
    if (!s) return notFound(base, name)
    const url = absoluteUrl(path)
    const title = `${s.title} in Lebanon | ${wwTitle} — ${name}`
    const items = (s.items || []).map((it) => it?.title).filter(Boolean)
    const description = metaDescription(
      `${stripDot(s.intro || s.summary)}.${items.length ? ` Services: ${items.join(', ')}.` : ''}`,
    )
    return {
      ...base,
      title,
      description,
      canonical: url,
      ...(s.image ? { image: absoluteAsset(s.image), imageAlt: s.title } : {}),
      jsonLd: graph([
        org,
        website,
        shop,
        webPage('WebPage', { url, title, description, breadcrumb: true, about: false }),
        breadcrumbJsonLd(url, [
          { name, path: '/' },
          { name: wwTitle, path: '/what-we-do' },
          { name: s.title, path },
        ]),
        serviceJsonLd(s, { full: true }),
      ]),
    }
  }

  if (path === '/contact') {
    const url = absoluteUrl(path)
    const intro = c.contact?.page?.intro || c.contact?.subheading || ''
    const title = `Contact ${name} — WhatsApp, Email & Instagram`
    const description = metaDescription(`Contact ${name} (${brand.legalName}) in Lebanon. ${intro}`)
    return {
      ...base,
      title,
      description,
      canonical: url,
      jsonLd: graph([
        org,
        website,
        shop,
        webPage('ContactPage', { url, title, description, breadcrumb: true }),
        breadcrumbJsonLd(url, [
          { name, path: '/' },
          { name: 'Contact', path },
        ]),
      ]),
    }
  }

  if (path === '/faq') {
    const url = absoluteUrl(path)
    const title = `FAQ — Location, Opening Hours & Services | ${name}`
    const where = c.shop?.address ? ` (${c.shop.address})` : ''
    const description = metaDescription(
      `Answers about ${name}: where we are${where}, opening hours, business solutions, shopping at AS Store, ` +
        'booking events and how to reach us.',
    )
    const items = siteFaq(c)
    return {
      ...base,
      title,
      description,
      canonical: url,
      jsonLd: graph([
        org,
        website,
        shop,
        {
          ...webPage('FAQPage', { url, title, description, breadcrumb: true }),
          // Built from the same siteFaq() list the page renders, so the markup
          // is exactly the visible questions and answers.
          mainEntity: items.map((it) => ({
            '@type': 'Question',
            name: it.q,
            acceptedAnswer: { '@type': 'Answer', text: it.a.join(' ') },
          })),
        },
        breadcrumbJsonLd(url, [
          { name, path: '/' },
          { name: 'FAQ', path },
        ]),
      ]),
    }
  }

  // /events lives on the ticketing hub now (vercel.json 301s it there). Should
  // anyone reach the in-site copy, its canonical is the hub's page.
  const eventsMatch = path.match(/^\/events(\/[^/]+)?$/)
  if (eventsMatch) {
    const hub = eventsHref(c.ticketingUrl || TICKETING_FALLBACK, eventsMatch[1] || '')
    return {
      ...base,
      title: `Events in Lebanon — ${name}`,
      description: metaDescription(c.eventsSection?.intro),
      canonical: isHttp(hub) ? hub : absoluteUrl(hub),
      jsonLd: null,
    }
  }

  // /store is a leftover "coming soon" page — the store itself is its own site.
  if (path === '/store') {
    return { ...base, title: `AS Store — ${name}`, description: '', canonical: '', robots: 'noindex, follow', jsonLd: null }
  }

  return notFound(base, name)
}

function notFound(base, name) {
  return { ...base, title: `Page not found — ${name}`, description: '', canonical: '', robots: 'noindex, follow', jsonLd: null }
}

/** The routes worth pre-rendering: every public page with its own content. */
export function prerenderRoutes(c) {
  if (!c.published) return [{ path: '/', module: 'src/pages/ComingSoon.jsx' }]
  return [
    { path: '/', module: 'src/pages/Home.jsx' },
    { path: '/what-we-do', module: 'src/pages/WhatWeDo.jsx' },
    ...visibleSolutions(c).map((s) => ({ path: `/what-we-do/${s.slug}`, module: 'src/pages/SolutionDetail.jsx' })),
    { path: '/contact', module: 'src/pages/Contact.jsx' },
    { path: '/faq', module: 'src/pages/Faq.jsx' },
  ]
}

// ---------------------------------------------------------------------------
// Writing the head: as an HTML string (build) and into the live DOM (client)
// ---------------------------------------------------------------------------

const escAttr = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

// `<` escaped so a title carrying markup can never close the script tag early.
export const jsonLdString = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c')

/** The flat list of tags a head is made of, shared by both writers below. */
function headTags(head, c) {
  const name = c.brand?.name || 'AS Company'
  const favicon = c.faviconUrl || '/ASCompanyLogo.jpg'
  const meta = [
    ['name', 'description', head.description],
    ['name', 'robots', head.robots],
    ['property', 'og:type', head.type || 'website'],
    ['property', 'og:site_name', name],
    ['property', 'og:locale', 'en_US'],
    ['property', 'og:title', head.title],
    ['property', 'og:description', head.description],
    ['property', 'og:url', head.canonical],
    ['property', 'og:image', head.image],
    ['property', 'og:image:alt', head.image ? head.imageAlt : ''],
    ['name', 'twitter:card', 'summary'],
    ['name', 'twitter:title', head.title],
    ['name', 'twitter:description', head.description],
    ['name', 'twitter:image', head.image],
  ]
  const links = [
    ['canonical', head.canonical],
    ['icon', favicon],
    ['apple-touch-icon', favicon],
  ]
  return { meta, links }
}

/** The <head> fragment scripts/prerender.mjs writes into each page. */
export function renderHeadTags(head, c) {
  const { meta, links } = headTags(head, c)
  const out = [`<title>${escAttr(head.title)}</title>`]
  for (const [attr, key, value] of meta) {
    if (value) out.push(`<meta ${attr}="${key}" content="${escAttr(value)}" />`)
  }
  for (const [rel, href] of links) {
    if (href) out.push(`<link rel="${rel}" href="${escAttr(href)}" />`)
  }
  if (head.jsonLd) {
    out.push(`<script type="application/ld+json" id="seo-jsonld">${jsonLdString(head.jsonLd)}</script>`)
  }
  return out.join('\n    ')
}

/** Brings the live document's head in line with `head` (client navigation). */
export function applyHead(head, c) {
  if (typeof document === 'undefined') return
  document.title = head.title
  const { meta, links } = headTags(head, c)

  for (const [attr, key, value] of meta) {
    let el = document.head.querySelector(`meta[${attr}="${key}"]`)
    if (!value) {
      el?.remove()
      continue
    }
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute(attr, key)
      document.head.appendChild(el)
    }
    el.setAttribute('content', value)
  }

  for (const [rel, href] of links) {
    let el = document.head.querySelector(`link[rel="${rel}"]`)
    if (!href) {
      el?.remove()
      continue
    }
    if (!el) {
      el = document.createElement('link')
      el.rel = rel
      document.head.appendChild(el)
    }
    if (el.getAttribute('href') !== href) el.setAttribute('href', href)
  }

  let script = document.getElementById('seo-jsonld')
  if (!head.jsonLd) {
    script?.remove()
  } else {
    if (!script) {
      script = document.createElement('script')
      script.type = 'application/ld+json'
      script.id = 'seo-jsonld'
      document.head.appendChild(script)
    }
    const text = jsonLdString(head.jsonLd)
    if (script.textContent !== text) script.textContent = text
  }
}
