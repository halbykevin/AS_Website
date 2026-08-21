// Google Merchant feed + Product structured data.
//
// Run with: npm test   (Node's built-in runner — no framework added)
//
// These are the guarantees Merchant Center suspends an account over, so they
// are asserted rather than eyeballed: what may be offered, what the numbers
// look like, and that the feed and the page never disagree about either.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CONDITION,
  IN_STOCK,
  OUT_OF_STOCK,
  REASONS,
  availabilityOf,
  formatPrice,
  isValidGtin,
  merchantEligible,
  merchantId,
  merchantOffer,
  productGtin,
  productImages,
  productMpn,
  productType,
  salePricing,
  sellingPrice,
} from '../src/lib/merchant.js'
import { buildMerchantFeed, feedItem, xmlEscape } from '../src/lib/merchantFeed.js'
import { productJsonLd } from '../src/lib/seo.js'

const SITE = 'https://store.as.com.lb'

// A product exactly as the public /api/products returns one.
const product = (over = {}) => ({
  id: 101,
  name: 'Lenovo ThinkPad X1 Carbon Gen 12',
  slug: 'lenovo-thinkpad-x1-carbon-gen-12',
  tagline: 'Light, fast, business-ready.',
  description: 'A 14-inch business ultrabook with an Intel Core Ultra 7 and 32GB of memory.',
  callForPrice: false,
  price: 1899.5,
  oldPrice: null,
  salePercent: null,
  categoryId: 7,
  category: 'Laptops',
  categorySlug: 'laptops',
  brandId: 3,
  brand: 'Lenovo',
  gtin: '',
  mpn: '',
  colors: [],
  stock: 0,
  visible: true,
  image: 'https://store-api.as.com.lb/uploads/x1.webp',
  images: ['https://store-api.as.com.lb/uploads/x1.webp'],
  ...over,
})

const categories = new Map([
  [3, { id: 3, name: 'Computers & Gear', parentId: null }],
  [7, { id: 7, name: 'Laptops', parentId: 3 }],
])

const itemsIn = (xml) => xml.match(/<item>[\s\S]*?<\/item>/g) || []
const fieldIn = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  return m ? m[1] : null
}

/* -- 1. A valid product appears in the feed -------------------------------- */

test('a normal in-stock product is submitted as a Shopping offer', () => {
  const { xml, included, errors } = buildMerchantFeed([product()], categories)
  assert.equal(included, 1)
  assert.equal(errors, 0)
  const items = itemsIn(xml)
  assert.equal(items.length, 1)
  assert.equal(fieldIn(items[0], 'g:id'), '101')
  assert.equal(fieldIn(items[0], 'g:title'), 'Lenovo ThinkPad X1 Carbon Gen 12')
  assert.equal(fieldIn(items[0], 'g:condition'), CONDITION)
  assert.equal(fieldIn(items[0], 'g:brand'), 'Lenovo')
})

test('the feed envelope is a valid RSS 2.0 document with the g: namespace', () => {
  const { xml } = buildMerchantFeed([product()], categories)
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/)
  assert.match(xml, /<rss version="2\.0" xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0">/)
  assert.match(xml, /<channel>/)
  assert.ok(xml.trimEnd().endsWith('</rss>'))
})

/* -- 2. Call for price is never a priced offer ----------------------------- */

test('a call-for-price product is excluded, with its own reason', () => {
  // This is the shape the API really sends: the flag set and price nulled out.
  const cfp = product({ id: 55, callForPrice: true, price: null, oldPrice: null })
  const { eligible, reasons } = merchantEligible(cfp)
  assert.equal(eligible, false)
  assert.deepEqual(reasons, [REASONS.CALL_FOR_PRICE])
  assert.equal(merchantOffer(cfp, categories), null)

  const { xml, included, excluded } = buildMerchantFeed([cfp], categories)
  assert.equal(included, 0)
  assert.equal(excluded[REASONS.CALL_FOR_PRICE], 1)
  assert.equal(itemsIn(xml).length, 0)
})

test('a call-for-price product cannot leak a price even if one is still attached', () => {
  // Belt and braces: an admin response (or a stale cache) could carry both the
  // flag and the number. The flag wins — no price, no offer.
  const cfp = product({ callForPrice: true, price: 2499, oldPrice: 2999 })
  assert.equal(sellingPrice(cfp), null)
  assert.equal(salePricing(cfp), null)
  const { xml } = buildMerchantFeed([cfp], categories)
  assert.equal(itemsIn(xml).length, 0)
  assert.ok(!xml.includes('2499'))
  assert.ok(!xml.includes('2999'))
})

test('no price, zero price and NaN price are all excluded', () => {
  for (const price of [null, undefined, 0, -1, 'abc', NaN]) {
    const p = product({ price })
    assert.equal(sellingPrice(p), null, `price ${String(price)}`)
    assert.ok(merchantEligible(p).reasons.includes(REASONS.NO_PRICE), `price ${String(price)}`)
  }
})

/* -- 3/4. Price formatting and currency ------------------------------------ */

test('prices are formatted as "0.00 USD" — two decimals, ISO currency', () => {
  assert.equal(formatPrice(550), '550.00 USD')
  assert.equal(formatPrice(1899.5), '1899.50 USD')
  assert.equal(formatPrice(0.5), '0.50 USD')
  assert.equal(formatPrice(1234567.891), '1234567.89 USD')
  // No thousands separator: Google rejects "1,234.00 USD".
  assert.ok(!formatPrice(1234).includes(','))
})

test('every price in the feed carries USD', () => {
  const { xml } = buildMerchantFeed([product(), product({ id: 2, slug: 'b', price: 12 })], categories)
  const prices = xml.match(/<g:price>([^<]+)<\/g:price>/g)
  assert.equal(prices.length, 2)
  for (const p of prices) assert.match(p, /^<g:price>\d+\.\d{2} USD<\/g:price>$/)
})

test('a genuine markdown becomes price + sale_price; a fake one does not', () => {
  const onSale = product({ price: 799, oldPrice: 999 })
  assert.deepEqual(salePricing(onSale), { price: 999, salePrice: 799 })
  const offer = merchantOffer(onSale, categories)
  assert.equal(offer.price, '999.00 USD')
  assert.equal(offer.salePrice, '799.00 USD')

  // oldPrice at or below the current price is not a discount.
  for (const oldPrice of [799, 500, 0, null]) {
    const notOnSale = product({ price: 799, oldPrice })
    assert.equal(salePricing(notOnSale).salePrice, null, `oldPrice ${String(oldPrice)}`)
    assert.equal(merchantOffer(notOnSale, categories).salePrice, '')
  }
  const { xml } = buildMerchantFeed([product({ price: 799, oldPrice: 799 })], categories)
  assert.ok(!xml.includes('<g:sale_price>'))
})

/* -- 5. XML escaping ------------------------------------------------------- */

test('xmlEscape covers the five predefined entities and strips illegal control characters', () => {
  assert.equal(xmlEscape('Tom & Jerry'), 'Tom &amp; Jerry')
  assert.equal(xmlEscape('<script>'), '&lt;script&gt;')
  assert.equal(xmlEscape('say "hi"'), 'say &quot;hi&quot;')
  assert.equal(xmlEscape("it's"), 'it&apos;s')
  // Ampersand first, so an escaped entity is never double-escaped.
  assert.equal(xmlEscape('a & <b> "c"'), 'a &amp; &lt;b&gt; &quot;c&quot;')
  // XML 1.0 has no representation for these at all, so they are removed.
  assert.equal(xmlEscape('a\u0000b\u0008c\u001Fd'), 'abcd')
  // Tab, newline and carriage return are legal and survive.
  assert.equal(xmlEscape('a\tb\nc\rd'), 'a\tb\nc\rd')
})

test('a product full of special characters produces a parseable item', () => {
  const nasty = product({
    id: 7,
    name: 'Sony WH-1000XM5 <Noise Cancelling> "Pro" & More \u0007',
    slug: 'sony-wh-1000xm5',
    description: 'Bass & treble — 30h battery. Compare: 5 > 4 & "best in class".',
    brand: 'Sony & Co',
  })
  const { xml, included } = buildMerchantFeed([nasty], categories)
  assert.equal(included, 1)
  // No raw metacharacter survived anywhere inside a text node.
  const item = itemsIn(xml)[0]
  const textNodes = item.match(/>([^<>]*)</g) || []
  for (const node of textNodes) {
    assert.ok(!node.slice(1, -1).includes('&') || node.includes('&amp;') || /&(lt|gt|quot|apos);/.test(node))
  }
  assert.equal(
    fieldIn(item, 'g:title'),
    'Sony WH-1000XM5 &lt;Noise Cancelling&gt; &quot;Pro&quot; &amp; More ',
  )
  assert.ok(!xml.includes('\u0007'))
  // And the document as a whole has no unescaped bare ampersand.
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml))
})

/* -- 6/7. Absolute URLs ---------------------------------------------------- */

test('product links are absolute https URLs on the storefront origin', () => {
  const offer = merchantOffer(product(), categories)
  assert.equal(offer.link, `${SITE}/product/lenovo-thinkpad-x1-carbon-gen-12`)
  assert.equal(new URL(offer.link).protocol, 'https:')
  // Never a search or category page.
  assert.ok(offer.link.includes('/product/'))
})

test('image links are absolute; a relative path is resolved, a junk one dropped', () => {
  assert.deepEqual(productImages(product({ images: ['/uploads/a.webp'], image: '' })), [
    `${SITE}/uploads/a.webp`,
  ])
  assert.deepEqual(productImages(product({ images: ['javascript:alert(1)'], image: '' })), [])
  assert.deepEqual(productImages(product({ images: ['   '], image: '' })), [])
  // Duplicates collapse, order is preserved, extras become additional images.
  const many = product({
    images: ['https://cdn.test/1.webp', 'https://cdn.test/1.webp', 'https://cdn.test/2.webp'],
  })
  const offer = merchantOffer(many, categories)
  assert.equal(offer.imageLink, 'https://cdn.test/1.webp')
  assert.deepEqual(offer.additionalImageLinks, ['https://cdn.test/2.webp'])
})

test('a product with no usable image is excluded', () => {
  const p = product({ image: '', images: [] })
  assert.ok(merchantEligible(p).reasons.includes(REASONS.NO_IMAGE))
  assert.equal(buildMerchantFeed([p], categories).included, 0)
})

/* -- 8/9. Availability ----------------------------------------------------- */

test('availability maps to Google vocabulary and matches the page', () => {
  assert.equal(availabilityOf(product()), IN_STOCK)
  assert.equal(availabilityOf(product({ visible: false })), OUT_OF_STOCK)
  const offer = merchantOffer(product(), categories)
  assert.equal(offer.availability, 'in_stock')
  // `stock` is not maintained in this catalogue (every row is 0) and checkout
  // does not enforce it, so it must not drive the claim — a working Add to Bag
  // alongside "out of stock" is the exact contradiction Google penalises.
  assert.equal(availabilityOf(product({ stock: 0 })), IN_STOCK)
  assert.equal(availabilityOf(product({ stock: 99 })), IN_STOCK)
})

test('a hidden product never reaches the feed', () => {
  const hidden = product({ visible: false })
  assert.ok(merchantEligible(hidden).reasons.includes(REASONS.HIDDEN))
  const { included, excluded } = buildMerchantFeed([hidden], categories)
  assert.equal(included, 0)
  assert.equal(excluded[REASONS.HIDDEN], 1)
})

/* -- 10/11/12. GTIN and MPN ------------------------------------------------ */

test('GTIN validation accepts real barcodes and rejects everything else', () => {
  // Real, checksum-valid identifiers of each supported length.
  assert.ok(isValidGtin('0194253715818')) // EAN-13
  assert.ok(isValidGtin('012345678905')) // UPC-12
  assert.ok(isValidGtin('96385074')) // GTIN-8
  assert.ok(isValidGtin('00012345678905')) // GTIN-14
  // Formatting noise is tolerated, the number is not changed.
  assert.ok(isValidGtin('019-425 371 5818'))
  // Wrong check digit, wrong length, all zeroes, an internal SKU.
  assert.ok(!isValidGtin('0194253715819'))
  assert.ok(!isValidGtin('123456789'))
  assert.ok(!isValidGtin('0000000000000'))
  assert.ok(!isValidGtin('SKU-101'))
  assert.ok(!isValidGtin(''))
  assert.ok(!isValidGtin(null))
})

test('a missing GTIN omits the element rather than emitting an empty one', () => {
  const { xml } = buildMerchantFeed([product({ gtin: '', mpn: '' })], categories)
  assert.equal(itemsIn(xml).length, 1)
  assert.ok(!xml.includes('<g:gtin>'))
  assert.ok(!xml.includes('<g:mpn>'))
})

test('an empty gtin/mpn NEVER becomes identifier_exists=no', () => {
  // The distinction this protects: `identifier_exists: no` is a claim about the
  // PRODUCT ("the manufacturer assigned none"), not about our database ("nobody
  // has typed one in"). A Lenovo laptop has a barcode whether or not we hold
  // it, so declaring otherwise is a false statement — and it tells Google to
  // stop trying to match the offer, which is the opposite of the intent.
  const branded = product({ brand: 'Lenovo', gtin: '', mpn: '' })
  const { xml, included } = buildMerchantFeed([branded], categories)
  assert.equal(included, 1, 'a missing identifier must never exclude the product')
  assert.ok(!xml.includes('identifier_exists'))
  assert.equal(fieldIn(xml, 'g:brand'), 'Lenovo')

  // Nor for a product with no brand at all.
  const anonymous = buildMerchantFeed([product({ brand: '', gtin: '', mpn: '' })], categories)
  assert.ok(!anonymous.xml.includes('identifier_exists'))
})

test('identifier_exists=no is written only from an explicit declaration', () => {
  // Nothing in the schema can express "this product genuinely has no
  // manufacturer identifier" today, so the element is unreachable from a real
  // product — merchantOffer() always leaves it undefined. feedItem() is
  // exercised directly to prove the branch exists for the day a column does.
  const offer = merchantOffer(product({ gtin: '', mpn: '' }), categories)
  assert.equal(offer.identifierExists, undefined)
  assert.ok(!feedItem(offer).includes('identifier_exists'))

  assert.ok(feedItem({ ...offer, identifierExists: false }).includes(
    '<g:identifier_exists>no</g:identifier_exists>',
  ))
  // Only an explicit `false` counts — not null, not '' , not 'no'.
  for (const notFalse of [null, '', 'no', 0]) {
    assert.ok(
      !feedItem({ ...offer, identifierExists: notFalse }).includes('identifier_exists'),
      String(notFalse),
    )
  }
})

test('a genuine GTIN is included and normalised', () => {
  const p = product({ gtin: '019-425 371 5818' })
  assert.equal(productGtin(p), '0194253715818')
  const { xml } = buildMerchantFeed([p], categories)
  assert.equal(fieldIn(xml, 'g:gtin'), '0194253715818')
  assert.ok(!xml.includes('identifier_exists'))
})

test('an invalid GTIN is dropped, not published, and the product still ships', () => {
  const p = product({ gtin: '1234567890123' }) // bad check digit
  assert.equal(productGtin(p), '')
  const { xml, included } = buildMerchantFeed([p], categories)
  assert.equal(included, 1)
  assert.ok(!xml.includes('<g:gtin>'))
  assert.ok(!xml.includes('1234567890123'))
})

test('a genuine MPN is included alongside the brand', () => {
  const p = product({ mpn: '  MGEA4LL/A ', brand: 'Apple' })
  assert.equal(productMpn(p), 'MGEA4LL/A')
  const { xml } = buildMerchantFeed([p], categories)
  assert.equal(fieldIn(xml, 'g:mpn'), 'MGEA4LL/A')
  assert.equal(fieldIn(xml, 'g:brand'), 'Apple')
  assert.ok(!xml.includes('identifier_exists'))
})

test('the internal product id is never emitted as an MPN or a GTIN', () => {
  // The regression that matters most: the page used to publish `mpn: product.id`.
  const p = product({ id: 4242, gtin: '', mpn: '' })
  const { xml } = buildMerchantFeed([p], categories)
  assert.equal(fieldIn(xml, 'g:id'), '4242')
  assert.ok(!xml.includes('<g:mpn>'))
  assert.ok(!xml.includes('<g:gtin>'))
  const ld = productJsonLd(p)
  assert.equal(ld.sku, '4242')
  assert.equal('mpn' in ld, false)
  assert.equal('gtin' in ld, false)
})

test('the Merchant id is the stable product id, never a mutable field', () => {
  assert.equal(merchantId(product()), '101')
  // Same product, everything volatile changed — the id must not move.
  const changed = product({ price: 999, stock: 5, description: 'new copy', slug: 'renamed' })
  assert.equal(merchantId(changed), merchantId(product()))
  assert.ok(merchantEligible(product({ id: null })).reasons.includes(REASONS.NO_ID))
})

/* -- 13. Many products ----------------------------------------------------- */

test('a mixed catalogue produces one well-formed document and an accurate tally', () => {
  const catalogue = [
    product({ id: 1, slug: 'a' }),
    product({ id: 2, slug: 'b', callForPrice: true, price: null }),
    product({ id: 3, slug: 'c', visible: false }),
    product({ id: 4, slug: 'd', image: '', images: [] }),
    product({ id: 5, slug: 'e', price: 0 }),
    product({ id: 6, slug: 'f', description: '', tagline: '' }),
    product({ id: 7, slug: 'g', gtin: '0194253715818' }),
    product({ id: 8, slug: 'h', name: 'A & B <C>' }),
  ]
  const { xml, included, excluded, errors } = buildMerchantFeed(catalogue, categories)
  assert.equal(errors, 0)
  assert.equal(included, 3) // 1, 7, 8
  assert.equal(excluded[REASONS.CALL_FOR_PRICE], 1)
  assert.equal(excluded[REASONS.HIDDEN], 1)
  assert.equal(excluded[REASONS.NO_IMAGE], 1)
  assert.equal(excluded[REASONS.NO_PRICE], 1)
  assert.equal(excluded[REASONS.NO_DESCRIPTION], 1)
  assert.equal(itemsIn(xml).length, 3)

  // Every id is unique and every link distinct — the two things that make
  // Merchant Center reject items as duplicates.
  const ids = [...xml.matchAll(/<g:id>([^<]+)<\/g:id>/g)].map((m) => m[1])
  const links = [...xml.matchAll(/<g:link>([^<]+)<\/g:link>/g)].map((m) => m[1])
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(links).size, links.length)
})

test('one malformed product cannot take the feed down with it', () => {
  // A getter that throws is the stand-in for whatever a bad row does next.
  const landmine = {
    id: 999,
    slug: 'boom',
    visible: true,
    price: 10,
    image: 'https://cdn.test/x.webp',
    images: ['https://cdn.test/x.webp'],
    get name() {
      throw new Error('corrupt row')
    },
  }
  const { xml, included, errors } = buildMerchantFeed([product(), landmine, product({ id: 2, slug: 'b' })], categories)
  assert.equal(errors, 1)
  assert.equal(included, 2)
  assert.equal(itemsIn(xml).length, 2)
  assert.ok(xml.trimEnd().endsWith('</rss>'))
})

test('an empty or junk catalogue still yields a valid empty document', () => {
  for (const input of [[], null, undefined, 'nonsense']) {
    const { xml, included } = buildMerchantFeed(input, categories)
    assert.equal(included, 0)
    assert.match(xml, /^<\?xml/)
    assert.ok(xml.trimEnd().endsWith('</rss>'))
  }
})

/* -- 14/15. Structured data agrees with the feed --------------------------- */

test('Product JSON-LD quotes the same price as the product source and the feed', () => {
  const p = product({ price: 1899.5 })
  const ld = productJsonLd(p)
  const offer = merchantOffer(p, categories)
  assert.equal(ld.offers.price, '1899.50')
  assert.equal(ld.offers.priceCurrency, 'USD')
  assert.equal(`${ld.offers.price} ${ld.offers.priceCurrency}`, offer.price)
})

test('on sale, JSON-LD quotes the payable price and the feed quotes both', () => {
  const p = product({ price: 799, oldPrice: 999 })
  const ld = productJsonLd(p)
  const offer = merchantOffer(p, categories)
  assert.equal(ld.offers.price, '799.00') // what the shopper pays
  assert.equal(offer.salePrice, '799.00 USD')
  assert.equal(offer.price, '999.00 USD')
})

test('JSON-LD availability is derived from the same function as the feed', () => {
  assert.equal(productJsonLd(product()).offers.availability, 'https://schema.org/InStock')
  assert.equal(
    productJsonLd(product({ visible: false })).offers.availability,
    'https://schema.org/OutOfStock',
  )
})

test('JSON-LD never invents an identifier', () => {
  const ld = productJsonLd(product({ gtin: '', mpn: '' }))
  // sku is our own id and is legitimate; mpn/gtin are the manufacturer's.
  assert.equal(ld.sku, '101')
  assert.equal('mpn' in ld, false, 'the internal id must not be published as an MPN')
  assert.equal('gtin' in ld, false)

  const real = productJsonLd(product({ gtin: '0194253715818', mpn: 'MGEA4LL/A' }))
  assert.equal(real.gtin, '0194253715818')
  assert.equal(real.mpn, 'MGEA4LL/A')

  // An invalid barcode is omitted rather than published.
  assert.equal('gtin' in productJsonLd(product({ gtin: '1234567890123' })), false)
})

test('a call-for-price page publishes no price in its structured data either', () => {
  const ld = productJsonLd(product({ callForPrice: true, price: null }))
  assert.equal('price' in ld.offers, false)
  assert.equal(ld.offers.availability, 'https://schema.org/InStoreOnly')
  assert.equal(JSON.stringify(ld).includes('1899'), false)
})

test('JSON-LD and the feed link to the same canonical product URL', () => {
  const p = product()
  assert.equal(productJsonLd(p).offers.url, merchantOffer(p, categories).link)
})

/* -- Extras ---------------------------------------------------------------- */

test('product_type is the real category trail, and survives a broken tree', () => {
  assert.equal(productType(product(), categories), 'Computers & Gear > Laptops')
  // No tree supplied: fall back to the product's own category name.
  assert.equal(productType(product(), undefined), 'Laptops')
  // A cycle must not hang the feed.
  const cyclic = new Map([
    [1, { id: 1, name: 'A', parentId: 2 }],
    [2, { id: 2, name: 'B', parentId: 1 }],
  ])
  assert.equal(productType(product({ categoryId: 1 }), cyclic), 'B > A')
})

test('titles and descriptions stay inside Google’s limits', () => {
  const long = product({ name: 'x'.repeat(400), description: 'y '.repeat(6000) })
  const offer = merchantOffer(long, categories)
  assert.ok(offer.title.length <= 150, `title was ${offer.title.length}`)
  assert.ok(offer.description.length <= 5000, `description was ${offer.description.length}`)
})

test('markdown in a description is flattened, not shipped as markup', () => {
  const p = product({
    description: '## Specs\n\nA **great** laptop with [a link](https://x.test) and ![img](https://x.test/i.png).',
  })
  const offer = merchantOffer(p, categories)
  assert.ok(!offer.description.includes('##'))
  assert.ok(!offer.description.includes('**'))
  assert.ok(!offer.description.includes('https://x.test'))
  assert.ok(offer.description.includes('a link'))
})

test('a feed item never emits an empty element', () => {
  const bare = merchantOffer(
    product({ brand: '', gtin: '', mpn: '', category: '', categoryId: null }),
    undefined,
  )
  const xml = feedItem(bare)
  assert.ok(!/<g:[a-z_]+><\/g:[a-z_]+>/.test(xml), xml)
  assert.ok(!xml.includes('<g:brand>'))
  assert.ok(!xml.includes('<g:product_type>'))
})
