// Central SEO configuration + helpers.
//
// NOTE: this module and lib/merchant.js import each other. The cycle is safe
// and deliberate — merchant.js only ever *calls* what it imports from here
// (SITE_URL, CURRENCY, metaDescription) from inside function bodies, never at
// module scope, so neither half needs the other to have finished evaluating.
// Keep it that way: a top-level `const X = SITE_URL + …` in merchant.js would
// turn this into a temporal-dead-zone crash at import time.
//
// SITE_URL is the storefront's public origin. Set NEXT_PUBLIC_SITE_URL in the
// environment (Vercel + .env.local) to the real domain — everything else
// (metadataBase, canonicals, sitemap URLs, OpenGraph images, JSON-LD) derives
// from it. The placeholder is only a fallback so builds don't crash locally.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://store.as.com.lb'
).replace(/\/$/, '')

export const SITE_NAME = 'AS Store'
export const SITE_TAGLINE = 'Online shopping for tech & electronics in Lebanon'
export const CURRENCY = 'USD'
export const LEGAL_NAME = 'Absolute Solutions SAL'

// The parent company's site. Its Organization node is declared there
// (src/lib/seo.js at the repo root) under this exact @id, and the ticketing
// hub points at the same one — which is what tells a search or answer engine
// that the three domains are one company. The www host is the one that serves
// (the bare domain redirects to it).
export const COMPANY_URL = (process.env.NEXT_PUBLIC_COMPANY_URL || 'https://www.as.com.lb').replace(/\/$/, '')
export const COMPANY_ORG_ID = `${COMPANY_URL}/#organization`

// The Merchant-feed derivations. Product structured data and the XML feed are
// built from the same functions so they cannot disagree about a price, an
// availability or an identifier — see lib/merchant.js.
import {
  availabilityOf,
  jsonLdDescription,
  merchantId,
  productGtin,
  productImages,
  productMpn,
  productUrl,
  salePricing,
  schemaAvailability,
} from './merchant.js'

// The return window and return cost, from the one module that states them.
// Safe to import at module scope: lib/returnPolicy.js imports nothing.
import { merchantReturnPolicyJsonLd } from './returnPolicy.js'

// Pure, imports nothing — safe at module scope like returnPolicy.js.
import { openingHoursJsonLd } from './hours.js'

// Absolute URL for a site-relative path (safe for OG images / canonicals).
export const absoluteUrl = (path = '/') =>
  `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`

// Trim CMS copy to a clean meta-description length (~160 chars) without cutting
// a word in half. Strips HTML in case a description carries markup.
export function metaDescription(text, fallback = '') {
  const clean = String(text || fallback || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= 160) return clean
  return `${clean.slice(0, 157).replace(/\s+\S*$/, '')}…`
}

// The default social-share image. Swap for a purpose-built 1200×630 banner when
// you have one; the logo is a safe fallback that always resolves.
export const DEFAULT_OG_IMAGE = absoluteUrl('/as-store-logo.png')

// Lebanon's governorates, as an address names them ("North Lebanon", "Mount
// Lebanon", "Bekaa"…). The one that ends an address is its addressRegion.
const GOVERNORATE =
  /^((north|south|mount) lebanon|north|south|beirut|bekaa|akkar|nabatieh|baalbek[- ]hermel|keserwan[- ]jbeil)( governorate)?$/i

/**
 * The shop's address (Site Settings -> Contact) as a PostalAddress. It is one
 * free-text field, read the way Lebanese addresses are written — "village,
 * town, governorate[, Lebanon]", e.g. "Kferhata, Zgharta, North Lebanon": the
 * country and the governorate come off the end, the last part left is the
 * town, and anything ahead of it is the finer location. The country is always
 * Lebanon: the store delivers nowhere else.
 *
 * A deliberate copy of the same function in src/lib/seo.js at the repo root,
 * which describes the same shop — keep the two in step.
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

/**
 * The physical shop — where returns are made and where people walk in — as a
 * LocalBusiness. Its @id is shared: as.com.lb's markup declares the same node
 * (built from the same settings, through the site API's /api/shop), so both
 * sites describe one place. Omitted until there is an address to state.
 */
export function shopJsonLd(settings = {}) {
  const address = String(settings?.contact?.address || '').trim()
  if (!address) return null
  const hours = openingHoursJsonLd(settings.hours)
  return {
    '@type': 'ElectronicsStore',
    '@id': `${SITE_URL}/#shop`,
    name: SITE_NAME,
    url: `${SITE_URL}/faq`,
    image: absoluteUrl('/as-store-logo.png'),
    address: postalAddress(address),
    ...(settings?.contact?.phone ? { telephone: settings.contact.phone } : {}),
    ...(settings?.contact?.email ? { email: settings.contact.email } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    areaServed: { '@type': 'Country', name: 'Lebanon' },
    parentOrganization: { '@id': COMPANY_ORG_ID },
  }
}

// site-wide Organization + WebSite JSON-LD. Rendered once in the root layout so
// Google can attach the brand knowledge panel + sitelinks search box.
//
// The node is the store itself — an OnlineStore named AS Store, the same name
// every Offer's `seller` carries — and it hangs off AS Company through
// `parentOrganization`, rather than calling itself "AS Company": one company,
// three sites, and each site's node says which part of it this is.
export function organizationJsonLd(settings = {}) {
  const shop = shopJsonLd(settings)
  // Profile URLs only: a bare "https://facebook.com" (the settings default)
  // would claim the store IS Facebook.
  const sameAs = Object.values(settings.socials || {}).filter((u) => /^https?:\/\/[^/]+\/./i.test(u || ''))
  const address = String(settings?.contact?.address || '').trim()
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'OnlineStore',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        legalName: LEGAL_NAME,
        description: SITE_TAGLINE,
        url: SITE_URL,
        logo: absoluteUrl('/as-store-logo.png'),
        parentOrganization: { '@type': 'Organization', '@id': COMPANY_ORG_ID, name: 'AS Company', url: `${COMPANY_URL}/` },
        areaServed: { '@type': 'Country', name: 'Lebanon' },
        ...(address ? { address: postalAddress(address) } : {}),
        // The counter behind the website: where orders can be returned.
        ...(shop ? { hasPOS: { '@id': shop['@id'] } } : {}),
        ...(sameAs.length ? { sameAs } : {}),
        ...(settings?.contact?.email ? { email: settings.contact.email } : {}),
        ...(settings?.contact?.phone ? { telephone: settings.contact.phone } : {}),
        // Site-wide return policy. Google Merchant Center's account settings
        // take precedence over this markup, so its real job is the organic free
        // listings — which is exactly why it must not disagree with them.
        hasMerchantReturnPolicy: merchantReturnPolicyJsonLd(SITE_URL),
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        publisher: { '@id': `${SITE_URL}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      ...(shop ? [shop] : []),
    ],
  }
}

// Product JSON-LD (Product + Offer) — the schema Google reads for rich results
// and that Merchant Center cross-checks the feed against.
//
// Every number and every identifier below comes from lib/merchant.js, the same
// module that builds /google-merchant.xml. That is the point: Google compares
// the page's structured data with the offer submitted for it, and a
// disagreement over price or availability is treated as a misrepresentation.
// One derivation, two consumers.
export function productJsonLd(product) {
  if (!product) return null
  const images = productImages(product)
  const gtin = productGtin(product)
  const mpn = productMpn(product)
  const description = jsonLdDescription(product)

  // "Call for price" products carry no price anywhere public, and that has to
  // include the structured data — this is the copy Google reads for rich
  // results. Publishing a price here would put the number back on the search
  // page we just took it off the product page for. schema.org has no "ask us"
  // price, so the offer states availability and sends people to the page;
  // PriceSpecification is omitted entirely. These products are also excluded
  // from the Merchant feed (merchantEligible -> REASONS.CALL_FOR_PRICE).
  const url = productUrl(product)
  const seller = { '@type': 'Organization', name: SITE_NAME }
  // Same policy the Organization publishes, repeated per offer because Google
  // reads the offer-level one for product results. One builder, so a change to
  // the window or the cost lands in both.
  const returnPolicy = merchantReturnPolicyJsonLd(SITE_URL)
  const pricing = salePricing(product)
  const offer = pricing
    ? {
        '@type': 'Offer',
        url,
        priceCurrency: CURRENCY,
        // The price a shopper pays today. `salePricing` puts the pre-discount
        // figure in `price` and the discounted one in `salePrice`; schema.org's
        // single `price` is the payable one, so it is the sale price when there
        // is one.
        price: (pricing.salePrice ?? pricing.price).toFixed(2),
        availability: schemaAvailability(availabilityOf(product)),
        itemCondition: 'https://schema.org/NewCondition',
        seller,
        hasMerchantReturnPolicy: returnPolicy,
      }
    : {
        '@type': 'Offer',
        url,
        priceCurrency: CURRENCY,
        availability: 'https://schema.org/InStoreOnly',
        itemCondition: 'https://schema.org/NewCondition',
        seller,
        hasMerchantReturnPolicy: returnPolicy,
      }

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(images.length ? { image: images } : {}),
    ...(description ? { description } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    // Our own stock-keeping identifier — the same value the feed sends as g:id,
    // so Google can tie the two together. It is NOT an mpn: `mpn` means the
    // *manufacturer's* part number, and an internal database key presented as
    // one is a fabricated identifier that breaks Google's product matching.
    // (This page used to emit `mpn: product.id`. It doesn't any more.)
    ...(merchantId(product) ? { sku: merchantId(product) } : {}),
    // Real manufacturer identifiers only, when a person has entered them.
    // `gtin` is the modern, length-agnostic property; the checksum is verified
    // before it is published.
    ...(gtin ? { gtin } : {}),
    ...(mpn ? { mpn } : {}),
    offers: offer,
  }
}

// Breadcrumb JSON-LD from an ordered [{ name, url }] trail.
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

// Tiny helper component-free JSON-LD script string (used with dangerouslySet…).
export const jsonLdScript = (obj) => ({ __html: JSON.stringify(obj) })
