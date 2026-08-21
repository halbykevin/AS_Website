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

// site-wide Organization + WebSite JSON-LD. Rendered once in the root layout so
// Google can attach the brand knowledge panel + sitelinks search box.
export function organizationJsonLd(settings = {}) {
  const sameAs = Object.values(settings.socials || {}).filter(Boolean)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'AS Company (Absolute Solutions SAL)',
        alternateName: SITE_NAME,
        url: SITE_URL,
        logo: absoluteUrl('/as-store-logo.png'),
        ...(sameAs.length ? { sameAs } : {}),
        ...(settings?.contact?.email ? { email: settings.contact.email } : {}),
        ...(settings?.contact?.phone ? { telephone: settings.contact.phone } : {}),
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
      }
    : {
        '@type': 'Offer',
        url,
        priceCurrency: CURRENCY,
        availability: 'https://schema.org/InStoreOnly',
        itemCondition: 'https://schema.org/NewCondition',
        seller,
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
