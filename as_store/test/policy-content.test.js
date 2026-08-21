// The public policy pages, checked as source text.
//
// These pages are the ones Google Merchant Center reads and compares against
// what the checkout charges, and the failure mode is not a crash — it is a
// sentence quietly saying the wrong number for months. There is no React
// renderer in this project and adding one for three static pages would be a
// poor trade, so the assertions read the component source. That catches the
// thing worth catching: a stale figure, a contradiction, or a claim we must
// never make.
//
// Confirmed business rules (store owner, 2026-08-21):
//   delivery estimate  2-5 days
//   delivery cost      $5 under $100, free at $100 or more
//   returns            3 days from delivery, opened items still eligible
//   VAT                11%, added at checkout, NOT included in shown prices

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

const SHIPPING = read('src/components/ShippingReturns.jsx')
const TERMS = read('src/components/TermsConditions.jsx')

/* -- The superseded claims are gone ---------------------------------------- */

test('the old 24-72 hour delivery claim is nowhere in the policy pages', () => {
  for (const [name, src] of [['ShippingReturns', SHIPPING], ['Terms', TERMS]]) {
    assert.ok(!/24\s*[-–]\s*72/.test(src), `${name} still claims 24-72 hours`)
    assert.ok(!/72 hours/i.test(src), `${name} still claims 72 hours`)
  }
})

test('the old 7-day return window is nowhere in the policy pages', () => {
  // Scoped to return/refund language on purpose — "7 days" is a perfectly
  // legitimate string elsewhere in the codebase (notification stats, spin logs).
  for (const [name, src] of [['ShippingReturns', SHIPPING], ['Terms', TERMS]]) {
    assert.ok(!/7[\s-]?days?/i.test(src), `${name} still mentions a 7-day window`)
  }
})

test('the seeded CMS copy no longer carries the superseded figures', () => {
  const seed = read('db/seed.sql')
  const shippingRow = seed.split('\n').filter((l) => l.includes("('shipping'")).join('\n')
  assert.ok(shippingRow, 'the shipping seed row disappeared')
  assert.ok(!/24-72/.test(shippingRow))
  assert.ok(!/7 days/.test(shippingRow))
  assert.ok(/2-5 days/.test(shippingRow))
  assert.ok(/3-day/.test(shippingRow))
})

/* -- The confirmed rules are stated ---------------------------------------- */

test('the shipping page states the 2-5 day delivery estimate', () => {
  assert.match(SHIPPING, /const DELIVERY_ESTIMATE = '2–5 days'/)
  assert.match(SHIPPING, /Estimated delivery: \{DELIVERY_ESTIMATE\}/)
})

test('the shipping page states a 3-day return window, measured from delivery', () => {
  assert.match(SHIPPING, /const RETURN_DAYS = 3/)
  assert.match(SHIPPING, /days from the day your order is delivered/)
})

test('the shipping page says an opened product is still refundable in the window', () => {
  // The owner's rule, verbatim in intent: "if opened in 3 days it's refundable".
  assert.match(SHIPPING, /Opening the product does not lose you that/)
  assert.match(SHIPPING, /unboxed the item and tried it, you are still eligible/)
})

test('the shipping page says there is no refund after the window', () => {
  assert.match(SHIPPING, /After \{RETURN_DAYS\} days we are not able to offer a refund/)
})

test('both policy pages agree on the return window', () => {
  assert.match(TERMS, /const RETURN_DAYS = 3/)
  assert.match(TERMS, /days of delivery/)
})

/* -- Nothing is invented --------------------------------------------------- */

test('the return policy invents no restriction the owner never gave', () => {
  // Every one of these would be a new obligation on the customer that nobody
  // has actually decided. They belong in BUSINESS INPUT REQUIRED, not on a page.
  const forbidden = [
    /unopened/i,
    /original seal/i,
    /restocking/i,
    /non-?returnable/i,
    /return shipping (?:is|costs|will be) (?:paid|charged|borne)/i,
    /exchange only/i,
    /within \d+ (?:business )?days of (?:refund|processing)/i,
  ]
  for (const re of forbidden) {
    assert.ok(!re.test(SHIPPING), `ShippingReturns invents a rule: ${re}`)
    assert.ok(!re.test(TERMS), `Terms invents a rule: ${re}`)
  }
})

test('no policy page publishes a placeholder', () => {
  for (const [name, src] of [['ShippingReturns', SHIPPING], ['Terms', TERMS]]) {
    assert.ok(!/\[INSERT/i.test(src), `${name} contains a placeholder`)
    assert.ok(!/TODO|TBD|XXX/.test(src.replace(/\/\/.*$/gm, '')), `${name} contains a placeholder`)
  }
})

/* -- VAT is stated as separate, never as included -------------------------- */

test('the policy pages say VAT is NOT included in the displayed price', () => {
  assert.match(SHIPPING, /VAT \(\{vatPercent\}%\) is not included in the displayed product price/)
  assert.match(TERMS, /Product prices shown on the site do not include VAT/)
})

test('no page anywhere claims prices include VAT', () => {
  // The single most damaging sentence we could publish, given the store adds
  // 11% on top at checkout. Swept across every source file that renders copy.
  const dirs = ['src/components', 'src/app', 'src/lib']
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(rel)
      else if (/\.(jsx?|mjs)$/.test(entry.name)) files.push(rel)
    }
  }
  dirs.forEach(walk)

  const claim = /(prices?\s+(?:are\s+)?(?:include|inclusive of|incl\.?)\s+vat)|(vat\s+included)|(tax\s+included)|(including\s+vat)/i
  const offenders = files.filter((f) => claim.test(read(f)))
  assert.deepEqual(offenders, [], `these files claim VAT is included: ${offenders.join(', ')}`)
})

test('the VAT rate is read from settings, never hardcoded in the copy', () => {
  // A typed "11%" would survive an admin changing the rate. Both pages must
  // render whatever settings.vat.percent says.
  for (const [name, src] of [['ShippingReturns', SHIPPING], ['Terms', TERMS]]) {
    assert.match(src, /settings\?\.vat\?\.percent/, `${name} does not read the VAT rate from settings`)
    const body = src.replace(/^\/\/.*$/gm, '')
    assert.ok(!/\b11\s?%/.test(body), `${name} hardcodes the VAT rate`)
  }
})

/* -- Delivery money is derived, not typed ---------------------------------- */

test('the delivery fee and threshold are read from settings, not hardcoded', () => {
  for (const [name, src] of [['ShippingReturns', SHIPPING], ['Terms', TERMS]]) {
    assert.match(src, /settings\?\.delivery\?\.fee/, `${name} hardcodes the delivery fee`)
    assert.match(src, /settings\?\.delivery\?\.freeOver/, `${name} hardcodes the threshold`)
    const body = src.replace(/^\s*\/\/.*$/gm, '')
    assert.ok(!/\$100\b/.test(body), `${name} hardcodes the $100 threshold`)
    assert.ok(!/\$5\b/.test(body), `${name} hardcodes the $5 fee`)
  }
})

test('the shipping page resolves the exactly-at-threshold case explicitly', () => {
  // The boundary the owner never specified and the code already decides
  // (`subtotal >= freeOver`). The page has to say which side it falls on, or a
  // $100 shopper cannot tell what they will be charged.
  assert.match(SHIPPING, /\{money\(freeOver\)\} or more/)
  assert.match(SHIPPING, /exactly \{money\(freeOver\)\} ships free/)
  assert.match(TERMS, /exactly \{money\(freeOver\)\} qualifies/)
})

/* -- Reachability ---------------------------------------------------------- */

test('both pages are routed, linked from the footer, and in the sitemap', () => {
  const route = read('src/app/(store)/pages/[slug]/page.jsx')
  assert.match(route, /params\.slug === 'shipping'/)
  assert.match(route, /params\.slug === 'terms'/)

  const footer = read('src/components/Footer.jsx')
  assert.match(footer, /href="\/pages\/shipping"/)
  assert.match(footer, /href="\/pages\/terms"/)
  assert.match(footer, /href="\/pages\/privacy"/)

  const sitemap = read('src/app/sitemap.js')
  assert.match(sitemap, /\/pages\/shipping/)
  assert.match(sitemap, /\/pages\/terms/)
})

test('robots.txt does not block the policy pages or the Merchant feed', () => {
  const robots = read('src/app/robots.js')
  const disallow = robots.match(/disallow:\s*\[([^\]]*)\]/)?.[1] ?? ''
  for (const p of ['/pages', '/google-merchant', '/sitemap']) {
    assert.ok(!disallow.includes(p), `robots.txt disallows ${p}`)
  }
})
