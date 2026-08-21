// Builds the Google Merchant Center product feed (RSS 2.0 + the g: namespace).
//
// Pure string assembly: hand it products and it hands back XML. The route that
// serves it (app/google-merchant.xml/route.js) does the fetching and caching,
// and scripts/check-merchant-feed.mjs runs this same function to audit a
// catalogue without a server. Splitting it that way is what makes the feed
// testable at all.

import { SITE_NAME, SITE_URL } from './seo.js'
import { merchantEligible, merchantOffer, REASONS } from './merchant.js'

/**
 * XML text escaping.
 *
 * Product names in this catalogue really do contain `&`, quotes, en-dashes and
 * emoji, and one unescaped ampersand makes the entire document unparseable —
 * Google would reject the whole feed, not the one item. Attribute delimiters
 * are escaped too even though nothing here writes attributes, so this stays
 * safe if something ever does.
 *
 * Control characters that XML 1.0 forbids outright (everything below 0x20 bar
 * tab/LF/CR) are dropped rather than escaped: `&#8;` is just as illegal as a
 * raw backspace, so there is nothing to escape it to.
 */
export function xmlEscape(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex -- the C0 range XML 1.0 forbids
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// One element, or nothing at all when the value is empty. Omitting an attribute
// is how you tell Google "we don't have this"; sending it empty is an error.
const tag = (name, value, indent = '      ') => {
  const v = typeof value === 'string' ? value : value == null ? '' : String(value)
  return v.trim() ? `${indent}<${name}>${xmlEscape(v)}</${name}>\n` : ''
}

/**
 * One <item>.
 *
 * On `identifier_exists` — and why it is absent.
 *
 * `identifier_exists: no` is a factual claim about the PRODUCT: "the
 * manufacturer never assigned this thing a GTIN or an MPN". It is not a claim
 * about our database. An Apple laptop has a barcode whether or not anybody has
 * typed it in here, so sending `no` for one would be a false statement made to
 * silence a warning — and it actively tells Google to stop trying to match the
 * offer to the real product, which is the opposite of what we want.
 *
 * So the rule is: emit the identifiers we genuinely hold, and when we hold
 * none, say nothing at all. Google's default for an absent `identifier_exists`
 * is to treat the identifiers as unknown and carry on, which is exactly the
 * truth. A missing GTIN is a warning in `npm run check-feed`, never an
 * exclusion and never a declaration.
 *
 * The only thing that could justify emitting `no` is a product genuinely sold
 * without any manufacturer identifier — unbranded or bespoke goods. Nothing in
 * the schema can express that today (an empty `gtin` column means "nobody has
 * entered one", which is a different fact), so the element is never written. If
 * such a column is ever added, this is where it plugs in: pass an explicit
 * `identifierExists === false` on the offer and nowhere else.
 */
export function feedItem(offer) {
  return (
    '    <item>\n' +
    tag('g:id', offer.id) +
    tag('g:title', offer.title) +
    tag('g:description', offer.description) +
    tag('g:link', offer.link) +
    tag('g:image_link', offer.imageLink) +
    offer.additionalImageLinks.map((u) => tag('g:additional_image_link', u)).join('') +
    tag('g:availability', offer.availability) +
    tag('g:price', offer.price) +
    tag('g:sale_price', offer.salePrice) +
    tag('g:condition', offer.condition) +
    tag('g:brand', offer.brand) +
    tag('g:gtin', offer.gtin) +
    tag('g:mpn', offer.mpn) +
    // Only ever written from an explicit, trustworthy "this product has no
    // manufacturer identifier" — never inferred from an empty column. See the
    // note above; no field sets this today, so it is currently always absent.
    (offer.identifierExists === false ? tag('g:identifier_exists', 'no') : '') +
    tag('g:product_type', offer.productType) +
    '    </item>\n'
  )
}

const EMPTY_TALLY = () =>
  Object.fromEntries(Object.values(REASONS).map((r) => [r, 0]))

/**
 * The whole document, plus a tally of what was left out and why.
 *
 * A single malformed product must never cost the other 1,700 their listings,
 * so every item is built inside its own try/catch: anything that throws is
 * counted as skipped and the feed carries on. That is the difference between a
 * feed that degrades and a feed that 500s at 3am when Google fetches it.
 *
 * @param {object[]} products      as returned by the public /api/products
 * @param {Map} [categoriesById]   id -> { id, name, parentId }, for product_type
 * @returns {{ xml: string, included: number, excluded: object, errors: number }}
 */
export function buildMerchantFeed(products, categoriesById, { title, link, description } = {}) {
  const list = Array.isArray(products) ? products : []
  const excluded = EMPTY_TALLY()
  let errors = 0
  let included = 0
  const items = []

  for (const product of list) {
    try {
      const { eligible, reasons } = merchantEligible(product)
      if (!eligible) {
        for (const reason of reasons) excluded[reason] = (excluded[reason] || 0) + 1
        continue
      }
      const offer = merchantOffer(product, categoriesById)
      if (!offer) continue
      items.push(feedItem(offer))
      included += 1
    } catch {
      // Keep going: one broken row is not worth the whole feed.
      errors += 1
    }
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n' +
    '  <channel>\n' +
    tag('title', title || `${SITE_NAME} — product feed`, '    ') +
    tag('link', link || SITE_URL, '    ') +
    tag('description', description || `Products available at ${SITE_NAME}.`, '    ') +
    items.join('') +
    '  </channel>\n' +
    '</rss>\n'

  return { xml, included, excluded, errors }
}
