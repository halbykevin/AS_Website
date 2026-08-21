// Google Merchant Center — one source of truth for "may we offer this product
// to Google, and on what terms".
//
// Three things read this module and they must never disagree, because Google
// compares them against each other and calls a mismatch a misrepresentation:
//
//   1. the XML feed          (lib/merchantFeed.js -> /google-merchant.xml)
//   2. the Product JSON-LD   (lib/seo.js -> every /product/<slug> page)
//   3. the page a shopper lands on and buys from
//
// Everything here is pure: it takes the product objects the storefront already
// loads from the API and derives nothing that isn't in them. No fetching, no
// framework imports — so it runs in the feed route, in a server component, and
// under `node --test` alike.

import { SITE_URL, CURRENCY, metaDescription } from './seo.js'

// Merchant's `condition` vocabulary. The catalogue is new retail stock only —
// there is no second-hand or refurbished line and no column that could say
// otherwise — which is the same claim the product pages have always made in
// their JSON-LD (schema.org/NewCondition). If a used/refurb line is ever added,
// it needs a real column and this constant has to give way to it.
export const CONDITION = 'new'

// Google's availability vocabulary. `preorder`/`backorder` are deliberately
// absent: nothing in the catalogue records a release or restock date, and
// guessing one is exactly the kind of claim that gets a feed suspended.
export const IN_STOCK = 'in_stock'
export const OUT_OF_STOCK = 'out_of_stock'

/**
 * Availability for one product.
 *
 * `products.stock` is NOT consulted, and that is a deliberate, uncomfortable
 * decision worth spelling out: the column exists but is not maintained — every
 * row in production sits at 0 — and nothing enforces it. Checkout does not
 * check it, the storefront does not show it, and POST /api/orders happily
 * accepts any visible product. Reading it here would tell Google the entire
 * catalogue is out of stock while every page still shows a working Add to Bag,
 * which is both false and the specific contradiction Merchant Center looks for.
 *
 * So availability tracks what the store will actually do: a visible, sellable
 * product can be bought today -> in_stock. A hidden one cannot -> out_of_stock
 * (it is also excluded from the feed entirely; this is only the honest answer
 * if a caller asks).
 *
 * When real inventory tracking arrives, this function is the one place to
 * change — and `merchantEligible` will start excluding nothing extra, because
 * out-of-stock products with a real price and a real page belong in the feed.
 */
export function availabilityOf(product) {
  return isPublic(product) ? IN_STOCK : OUT_OF_STOCK
}

// schema.org's equivalents, so the JSON-LD on the page can never drift from the
// availability the feed claims for the same product.
const SCHEMA_AVAILABILITY = {
  [IN_STOCK]: 'https://schema.org/InStock',
  [OUT_OF_STOCK]: 'https://schema.org/OutOfStock',
}

export const schemaAvailability = (availability) =>
  SCHEMA_AVAILABILITY[availability] || SCHEMA_AVAILABILITY[OUT_OF_STOCK]

/* -- Identifiers ---------------------------------------------------------- */

// Mirrors normalizeGtin/isValidGtin in server/src/app.js. The API validates on
// write, but the feed re-checks on read: a GTIN could predate that validation,
// or arrive from an import that bypassed the route, and one bad check digit is
// worth dropping the attribute over — never the product.
export function isValidGtin(raw) {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(d.length)) return false
  if (/^0+$/.test(d)) return false
  const sum = d
    .slice(0, -1)
    .split('')
    .reverse()
    .reduce((t, c, i) => t + Number(c) * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === Number(d.slice(-1))
}

export const productGtin = (product) => {
  const d = String(product?.gtin ?? '').replace(/\D/g, '')
  return isValidGtin(d) ? d : ''
}

export const productMpn = (product) => String(product?.mpn ?? '').trim()

/**
 * The Merchant `id`. It is `products.id` — the SERIAL primary key — because the
 * one hard rule is that this value must never change for a product that is
 * still the same product. The slug changes when someone retitles an item, the
 * price changes weekly, stock changes daily; the key does not. Feeding Google a
 * new id for an existing product resets its performance history and can read as
 * a duplicate offer.
 */
export const merchantId = (product) =>
  product?.id === 0 || product?.id ? String(product.id) : ''

/* -- Money ---------------------------------------------------------------- */

// A positive, finite number, or null. Guards the whole price path against the
// three ways a price goes wrong here: null (a "call for price" product, whose
// price the API strips), 0 (a product nobody has priced yet) and NaN.
export function sellingPrice(product) {
  if (product?.callForPrice) return null
  const n = Number(product?.price)
  return Number.isFinite(n) && n > 0 ? n : null
}

// "550.00 USD" — Google's required shape: value, a space, the ISO currency.
// Always two decimals, never a thousands separator.
export const formatPrice = (amount, currency = CURRENCY) =>
  `${Number(amount).toFixed(2)} ${currency}`

/**
 * The genuine sale price, or null.
 *
 * `price` is already what the shopper pays (the API applies any running sale
 * before it leaves the server) and `oldPrice` is the struck-through original.
 * Google wants that the other way round: `price` = the regular price,
 * `sale_price` = the discounted one. Only a real markdown qualifies — an
 * oldPrice that is equal to or below the current price is not a sale, and
 * submitting one would advertise a discount that does not exist.
 */
export function salePricing(product) {
  const price = sellingPrice(product)
  if (price == null) return null
  const old = Number(product?.oldPrice)
  const onSale = Number.isFinite(old) && old > price
  return onSale ? { price: old, salePrice: price } : { price, salePrice: null }
}

/* -- URLs ----------------------------------------------------------------- */

export const productPath = (product) => `/product/${product?.slug ?? ''}`

export const productUrl = (product) => `${SITE_URL}${productPath(product)}`

// Every URL in the feed has to be absolute and https. Product images come back
// from the API already absolute (store-api.as.com.lb/uploads/…), but a relative
// path would silently produce a broken image in Merchant Center, so resolve
// against the site origin and refuse anything that isn't http(s).
export function absoluteImage(url) {
  const raw = typeof url === 'string' ? url.trim() : ''
  if (!raw) return ''
  try {
    const resolved = new URL(raw, `${SITE_URL}/`)
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') return ''
    return resolved.href
  } catch {
    return ''
  }
}

// Gallery, de-duplicated and absolute. First entry becomes `image_link`, the
// rest `additional_image_link` (Google accepts up to 10 of those).
export function productImages(product) {
  const raw = Array.isArray(product?.images) && product.images.length
    ? product.images
    : product?.image
      ? [product.image]
      : []
  const seen = new Set()
  const out = []
  for (const src of raw) {
    const abs = absoluteImage(src)
    if (abs && !seen.has(abs)) {
      seen.add(abs)
      out.push(abs)
    }
  }
  return out
}

export const MAX_ADDITIONAL_IMAGES = 10

/* -- Text ----------------------------------------------------------------- */

// Google rejects an offer with no description and shows the first ~150
// characters of it in the ad, so the fallback chain matters. Markdown markers
// are stripped: descriptions come from the importer as markdown, and "## Specs"
// rendered literally in a Shopping ad looks broken.
export function merchantDescription(product) {
  const source = product?.description || product?.tagline || ''
  const plain = String(source)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> their text
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/[*_`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Google's hard cap is 5000 characters.
  return plain.length > 5000 ? `${plain.slice(0, 4997).replace(/\s+\S*$/, '')}…` : plain
}

// Google's cap for `title` is 150 characters.
export const merchantTitle = (product) => {
  const name = String(product?.name || '').replace(/\s+/g, ' ').trim()
  return name.length > 150 ? `${name.slice(0, 149).replace(/\s+\S*$/, '')}…` : name
}

// `product_type` is our own taxonomy, sent as a breadcrumb string. Real data
// only — the category the product is actually filed under.
export function productType(product, categoriesById) {
  const trail = []
  let node = categoriesById?.get?.(product?.categoryId)
  const guard = new Set()
  while (node && !guard.has(node.id)) {
    guard.add(node.id)
    trail.unshift(node.name)
    node = node.parentId ? categoriesById.get(node.parentId) : null
  }
  if (!trail.length && product?.category) trail.push(product.category)
  return trail.filter(Boolean).join(' > ')
}

/* -- Eligibility ---------------------------------------------------------- */

// Reason codes, so a caller (the validator script, a test) can tell *why* a
// product was held back without parsing prose.
export const REASONS = {
  HIDDEN: 'not_public',
  NO_ID: 'no_stable_id',
  NO_SLUG: 'no_landing_page',
  CALL_FOR_PRICE: 'call_for_price',
  NO_PRICE: 'no_positive_price',
  NO_IMAGE: 'no_image',
  NO_TITLE: 'no_title',
  NO_DESCRIPTION: 'no_description',
}

// Visible and not hidden by the catalog sync's delisting pass. `visible` is the
// only flag the storefront itself honours; `delistedAt` is set alongside
// visible=false, so this is belt and braces for a product mid-sync.
export const isPublic = (product) =>
  Boolean(product) && product.visible !== false

/**
 * May this product be submitted to Google as a purchasable Shopping offer?
 *
 * Returns { eligible, reasons } rather than a bare boolean so that one function
 * serves the feed (drop it), the validator (explain it) and the tests (assert
 * on the specific reason). Every condition is a thing Google requires of an
 * offer — none of them is a matter of taste:
 *
 *   public          a page Google can crawl and a shopper can reach
 *   stable id       an identifier that survives a price or stock change
 *   landing page    /product/<slug> — never a search or category URL
 *   real price      a positive number in USD, which "call for price" has not
 *   image           at least one, absolute and https
 *   title + text    something to put in the ad
 *
 * "Call for price" is called out with its own reason rather than folded into
 * "no price": the API strips the price from those products, so they arrive here
 * indistinguishable from an unpriced one, and the report needs to tell a
 * deliberate business decision apart from a data gap.
 */
export function merchantEligible(product) {
  const reasons = []
  if (!isPublic(product)) reasons.push(REASONS.HIDDEN)
  if (!merchantId(product)) reasons.push(REASONS.NO_ID)
  if (!product?.slug) reasons.push(REASONS.NO_SLUG)
  if (product?.callForPrice) reasons.push(REASONS.CALL_FOR_PRICE)
  else if (sellingPrice(product) == null) reasons.push(REASONS.NO_PRICE)
  if (!productImages(product).length) reasons.push(REASONS.NO_IMAGE)
  if (!merchantTitle(product)) reasons.push(REASONS.NO_TITLE)
  if (!merchantDescription(product)) reasons.push(REASONS.NO_DESCRIPTION)
  return { eligible: reasons.length === 0, reasons }
}

/**
 * One product, flattened into exactly the values the feed and the JSON-LD both
 * need. Returns null for anything ineligible, so a caller cannot accidentally
 * emit a half-formed offer.
 *
 * `categoriesById` is optional — a Map of id -> { id, name, parentId } used to
 * build `product_type`. Without it the product's own category name is used.
 */
export function merchantOffer(product, categoriesById) {
  if (!merchantEligible(product).eligible) return null
  const pricing = salePricing(product)
  const images = productImages(product)
  return {
    id: merchantId(product),
    title: merchantTitle(product),
    description: merchantDescription(product),
    link: productUrl(product),
    imageLink: images[0],
    additionalImageLinks: images.slice(1, 1 + MAX_ADDITIONAL_IMAGES),
    availability: availabilityOf(product),
    price: formatPrice(pricing.price),
    salePrice: pricing.salePrice == null ? '' : formatPrice(pricing.salePrice),
    condition: CONDITION,
    brand: String(product.brand || '').trim(),
    gtin: productGtin(product),
    mpn: productMpn(product),
    productType: productType(product, categoriesById),
    currency: CURRENCY,
    // Tri-state, and only two of the three are reachable today:
    //   undefined  we do not know whether the manufacturer assigned one
    //   false      the product genuinely has none (nothing sets this yet)
    // An empty `gtin`/`mpn` column means "nobody has typed it in", which is the
    // first case, not the second — so this stays undefined and the feed omits
    // g:identifier_exists entirely. See feedItem() in merchantFeed.js.
    identifierExists: undefined,
  }
}

// Product JSON-LD leans on the same numbers, and phrases the description with
// the site's own meta-description trimmer so the page's <meta> and its schema
// agree. Kept here (not in seo.js) so there is one derivation, not two.
export const jsonLdDescription = (product) =>
  metaDescription(merchantDescription(product))
