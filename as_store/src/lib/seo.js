// Central SEO configuration + helpers.
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
// and that Merchant Center / Shopping ads validate against.
export function productJsonLd(product) {
  if (!product) return null
  const images = product.images?.length
    ? product.images
    : product.image
      ? [product.image]
      : []
  const price = Number(product.price) || 0
  // "Call for price" products carry no price anywhere public, and that has to
  // include the structured data — this is the copy Google reads for rich
  // results and Merchant Center. Publishing a price here would put the number
  // back on the search page we just took it off the product page for.
  // schema.org has no "ask us" price, so the offer states availability and
  // sends people to the page; PriceSpecification is omitted entirely.
  const offer = product.callForPrice
    ? {
        '@type': 'Offer',
        url: absoluteUrl(`/product/${product.slug}`),
        priceCurrency: CURRENCY,
        availability: 'https://schema.org/InStoreOnly',
        itemCondition: 'https://schema.org/NewCondition',
        ...(product.brand ? { seller: { '@type': 'Organization', name: 'AS Store' } } : {}),
      }
    : {
        '@type': 'Offer',
        url: absoluteUrl(`/product/${product.slug}`),
        priceCurrency: CURRENCY,
        price: price.toFixed(2),
        // Visible products are assumed sellable; wire this to a real stock field
        // when the catalog carries one.
        availability: 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
        ...(product.brand ? { seller: { '@type': 'Organization', name: 'AS Store' } } : {}),
      }
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(images.length ? { image: images } : {}),
    ...(product.description
      ? { description: metaDescription(product.description, product.tagline) }
      : product.tagline
        ? { description: product.tagline }
        : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(product.sku ? { sku: String(product.sku) } : {}),
    ...(product.id ? { mpn: String(product.id) } : {}),
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
