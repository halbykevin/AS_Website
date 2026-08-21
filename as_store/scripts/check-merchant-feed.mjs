#!/usr/bin/env node
// Audits the Google Merchant feed and reports what Merchant Center would
// complain about — before Google does.
//
//   npm run check-feed                       # build from the live API
//   npm run check-feed -- --url https://…    # fetch a served feed instead
//   npm run check-feed -- --json             # machine-readable summary
//   npm run check-feed -- --list no_image    # name the products behind a warning
//
// Two modes, on purpose. Building from the API exercises the same
// buildMerchantFeed() the route uses, so it works before anything is deployed;
// fetching a URL checks what Google will really receive, headers included.

import { merchantOffer, REASONS } from '../src/lib/merchant.js'
import { buildMerchantFeed } from '../src/lib/merchantFeed.js'

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const API = value('api') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
const FEED_URL = value('url')
const asJson = flag('json')
const listReason = value('list')

const num = (n) => String(n).padStart(6)

/* -- Source A: build from the catalogue ----------------------------------- */

async function fromApi() {
  const [products, categories] = await Promise.all([
    fetch(`${API}/api/products`).then((r) => {
      if (!r.ok) throw new Error(`GET /api/products -> HTTP ${r.status}`)
      return r.json()
    }),
    fetch(`${API}/api/categories`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
  ])
  const byId = new Map(
    categories.map((c) => [c.id, { id: c.id, name: c.name, parentId: c.parentId ?? null }]),
  )
  const built = buildMerchantFeed(products, byId)
  return { products, byId, built, source: `${API}/api/products` }
}

/* -- Source B: a served feed ---------------------------------------------- */

// Deliberately regex-based rather than a parser dependency: this checks the
// bytes Google receives, and a real parser would happily normalise away the
// very defects (bad escaping, stray control characters) worth catching.
async function fromUrl(url) {
  const res = await fetch(url)
  const xml = await res.text()
  const contentType = res.headers.get('content-type') || ''
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || []
  const field = (block, name) => {
    const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
    return m ? m[1] : ''
  }
  const unescape = (v) =>
    v
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
  const offers = items.map((block) => ({
    id: unescape(field(block, 'g:id')),
    title: unescape(field(block, 'g:title')),
    description: unescape(field(block, 'g:description')),
    link: unescape(field(block, 'g:link')),
    imageLink: unescape(field(block, 'g:image_link')),
    additionalImageLinks: [],
    availability: field(block, 'g:availability'),
    price: field(block, 'g:price'),
    salePrice: field(block, 'g:sale_price'),
    condition: field(block, 'g:condition'),
    brand: unescape(field(block, 'g:brand')),
    gtin: field(block, 'g:gtin'),
    mpn: unescape(field(block, 'g:mpn')),
    productType: unescape(field(block, 'g:product_type')),
  }))
  return { xml, offers, status: res.status, contentType, source: url }
}

/* -- Checks --------------------------------------------------------------- */

const PRICE_RE = /^\d+\.\d{2} [A-Z]{3}$/
const AVAILABILITY = new Set(['in_stock', 'out_of_stock', 'preorder', 'backorder'])

function auditOffers(offers) {
  const warn = {
    missing_brand: [],
    missing_gtin: [],
    missing_mpn: [],
    no_identifier_at_all: [],
    missing_image: [],
    missing_description: [],
    short_description: [],
    nonnumeric_price: [],
    invalid_availability: [],
    non_https_link: [],
    non_https_image: [],
    malformed_link: [],
    duplicate_id: [],
    duplicate_url: [],
    title_too_long: [],
  }
  const seenId = new Map()
  const seenUrl = new Map()

  for (const o of offers) {
    const label = `${o.id} ${o.title.slice(0, 60)}`
    if (!o.brand) warn.missing_brand.push(label)
    if (!o.gtin) warn.missing_gtin.push(label)
    if (!o.mpn) warn.missing_mpn.push(label)
    if (!o.gtin && !(o.brand && o.mpn)) warn.no_identifier_at_all.push(label)
    if (!o.imageLink) warn.missing_image.push(label)
    if (!o.description) warn.missing_description.push(label)
    else if (o.description.length < 30) warn.short_description.push(label)
    if (!PRICE_RE.test(o.price)) warn.nonnumeric_price.push(`${label} -> "${o.price}"`)
    if (!AVAILABILITY.has(o.availability)) warn.invalid_availability.push(`${label} -> "${o.availability}"`)
    if (o.title.length > 150) warn.title_too_long.push(label)

    for (const [url, bucket] of [
      [o.link, warn.non_https_link],
      [o.imageLink, warn.non_https_image],
    ]) {
      if (!url) continue
      try {
        const u = new URL(url)
        if (u.protocol !== 'https:') bucket.push(`${label} -> ${url}`)
      } catch {
        warn.malformed_link.push(`${label} -> ${url}`)
      }
    }

    if (seenId.has(o.id)) warn.duplicate_id.push(`${o.id} (also ${seenId.get(o.id)})`)
    else seenId.set(o.id, o.title.slice(0, 40))
    if (seenUrl.has(o.link)) warn.duplicate_url.push(`${o.link}`)
    else seenUrl.set(o.link, o.id)
  }
  return warn
}

// Image dimensions straight from the bytes — no image library. Merchant Center
// rejects anything under 100x100 and does poorly with small photos, so this
// answers "are we shipping thumbnails?" on a sample rather than 1,700 fetches.
async function sampleImageSizes(offers, sampleSize) {
  const pick = offers
    .filter((o) => o.imageLink)
    .sort(() => Math.random() - 0.5)
    .slice(0, sampleSize)
  const tiny = []
  let checked = 0
  let unreadable = 0
  for (const o of pick) {
    try {
      const res = await fetch(o.imageLink)
      const buf = Buffer.from(await res.arrayBuffer())
      const d = imageSize(buf)
      if (!d) {
        unreadable += 1
        continue
      }
      checked += 1
      if (Math.min(d[0], d[1]) < 250) tiny.push(`${o.id} ${d[0]}x${d[1]} ${o.imageLink}`)
    } catch {
      unreadable += 1
    }
  }
  return { checked, tiny, unreadable, sampled: pick.length }
}

// Identifier coverage — the report that says which brands are worth enriching
// first. Missing identifiers are never a reason to exclude a product (see
// feedItem() in merchantFeed.js on why `identifier_exists: no` is not written),
// so this is a work queue, not a defect list.
function identifierCoverage(offers) {
  const total = offers.length
  const withGtin = offers.filter((o) => o.gtin)
  const withMpn = offers.filter((o) => o.mpn)
  const withBoth = offers.filter((o) => o.gtin && o.mpn)
  const withNeither = offers.filter((o) => !o.gtin && !o.mpn)

  // Group the gaps by brand, biggest first, so enrichment can start where it
  // buys the most coverage.
  const byBrand = new Map()
  for (const o of offers) {
    const brand = o.brand || '(no brand)'
    const row = byBrand.get(brand) || { brand, total: 0, noGtin: 0, noMpn: 0, noneAtAll: 0 }
    row.total += 1
    if (!o.gtin) row.noGtin += 1
    if (!o.mpn) row.noMpn += 1
    if (!o.gtin && !o.mpn) row.noneAtAll += 1
    byBrand.set(brand, row)
  }
  const brands = [...byBrand.values()]
    .filter((r) => r.noneAtAll > 0)
    .sort((a, b) => b.noneAtAll - a.noneAtAll)

  return {
    total,
    withGtin: withGtin.length,
    withoutGtin: total - withGtin.length,
    withMpn: withMpn.length,
    withoutMpn: total - withMpn.length,
    withBoth: withBoth.length,
    withNeither: withNeither.length,
    // No field distinguishes "unknown" from "the manufacturer assigned none",
    // so this is structurally zero today — reported so its absence is visible
    // rather than assumed. See merchantFeed.js.
    declaredNoIdentifier: offers.filter((o) => o.identifierExists === false).length,
    brands,
  }
}

function imageSize(buf) {
  if (buf.length < 32) return null
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    const kind = buf.subarray(12, 16).toString('ascii')
    if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)]
    if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff]
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]
    }
  }
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('ascii') === 'PNG') {
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)]
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2
    while (o < buf.length - 8) {
      if (buf[o] !== 0xff) {
        o += 1
        continue
      }
      const marker = buf[o + 1]
      const len = buf.readUInt16BE(o + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return [buf.readUInt16BE(o + 7), buf.readUInt16BE(o + 5)]
      }
      o += 2 + len
    }
  }
  return null
}

/* -- Run ------------------------------------------------------------------ */

const REASON_LABEL = {
  [REASONS.HIDDEN]: 'hidden / not public',
  [REASONS.NO_ID]: 'no stable id',
  [REASONS.NO_SLUG]: 'no landing page',
  [REASONS.CALL_FOR_PRICE]: 'call for price (deliberate)',
  [REASONS.NO_PRICE]: 'no positive price',
  [REASONS.NO_IMAGE]: 'no image',
  [REASONS.NO_TITLE]: 'no title',
  [REASONS.NO_DESCRIPTION]: 'no description',
}

const result = FEED_URL ? await fromUrl(FEED_URL) : await fromApi()

let offers
let excluded = null
let total = null
let xml = result.xml

if (FEED_URL) {
  offers = result.offers
} else {
  total = result.products.length
  excluded = result.built.excluded
  offers = result.products
    .map((p) => merchantOffer(p, result.byId))
    .filter(Boolean)
  xml = result.built.xml
}

const warnings = auditOffers(offers)
const identifiers = identifierCoverage(offers)
const wellFormed = /^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(xml) && xml.trimEnd().endsWith('</rss>')

const images = flag('skip-images') ? null : await sampleImageSizes(offers, Number(value('sample')) || 25)

if (asJson) {
  console.log(
    JSON.stringify(
      {
        source: result.source,
        total,
        offers: offers.length,
        excluded,
        warnings: Object.fromEntries(Object.entries(warnings).map(([k, v]) => [k, v.length])),
        identifiers,
        images: images && { ...images, tiny: images.tiny.length },
        wellFormed,
        bytes: xml.length,
      },
      null,
      2,
    ),
  )
} else {
  console.log(`\nGoogle Merchant feed audit — ${result.source}`)
  if (FEED_URL) console.log(`  HTTP ${result.status} · ${result.contentType}`)
  console.log(`  ${num(xml.length)} bytes · well-formed envelope: ${wellFormed ? 'yes' : 'NO'}`)
  if (total != null) console.log(`  ${num(total)} products in the catalogue`)
  console.log(`  ${num(offers.length)} submitted as Shopping offers`)

  if (excluded) {
    console.log('\nExcluded')
    for (const [reason, count] of Object.entries(excluded)) {
      if (count) console.log(`  ${num(count)}  ${REASON_LABEL[reason] || reason}`)
    }
  }

  console.log('\nIdentifier coverage')
  console.log(`  ${num(identifiers.withGtin)}  with a GTIN`)
  console.log(`  ${num(identifiers.withoutGtin)}  without a GTIN`)
  console.log(`  ${num(identifiers.withMpn)}  with an MPN`)
  console.log(`  ${num(identifiers.withoutMpn)}  without an MPN`)
  console.log(`  ${num(identifiers.withBoth)}  with both`)
  console.log(`  ${num(identifiers.withNeither)}  with neither (submitted anyway, no identifier_exists)`)
  console.log(`  ${num(identifiers.declaredNoIdentifier)}  declared as genuinely having no manufacturer identifier`)

  if (identifiers.brands.length) {
    const top = Number(value('brands')) || 15
    console.log(`\nMissing both identifiers, by brand (top ${top}) — the enrichment queue`)
    for (const b of identifiers.brands.slice(0, top)) {
      console.log(`  ${num(b.noneAtAll)}  ${b.brand}  (of ${b.total} offers)`)
    }
    if (identifiers.brands.length > top) {
      console.log(`         … and ${identifiers.brands.length - top} more brands`)
    }
  }

  console.log('\nWarnings (an offer can carry more than one)')
  for (const [name, list] of Object.entries(warnings)) {
    if (list.length) console.log(`  ${num(list.length)}  ${name}`)
  }
  if (!Object.values(warnings).some((l) => l.length)) console.log('  none')

  if (images) {
    console.log(
      `\nImages — sampled ${images.sampled}: ${images.checked} readable, ` +
        `${images.tiny.length} under 250px, ${images.unreadable} unreadable`,
    )
    for (const t of images.tiny.slice(0, 10)) console.log(`    ${t}`)
  }

  if (listReason) {
    const list = warnings[listReason]
    if (!list) console.log(`\nNo such warning: ${listReason}`)
    else {
      console.log(`\n${listReason} (${list.length})`)
      for (const l of list.slice(0, 50)) console.log(`  ${l}`)
      if (list.length > 50) console.log(`  … and ${list.length - 50} more`)
    }
  }
  console.log('')
}

// Only hard failures fail the command: a warning is information, a malformed
// document or a duplicate id is a feed Google will reject.
const fatal =
  !wellFormed ||
  warnings.duplicate_id.length > 0 ||
  warnings.nonnumeric_price.length > 0 ||
  warnings.invalid_availability.length > 0 ||
  warnings.malformed_link.length > 0
process.exit(fatal ? 1 : 0)
