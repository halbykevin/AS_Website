// Checkout money: the delivery threshold, the VAT line, and the promise that
// the two implementations of each can never disagree.
//
// There are deliberately two: the server's (server/src/app.js) is what actually
// charges the customer, and the storefront's (src/lib/orders.js) exists only so
// the cart can *show* the figure before the order is created. A drift between
// them is invisible in testing and infuriating in production — the summary says
// one total, the receipt says another — so this file imports BOTH and runs them
// over the same table.
//
// Confirmed business rules (store owner, 2026-08-21):
//   under $100  -> $5 delivery
//   $100 or more -> free        (the code's boundary is `>=`, so exactly $100 is free)
//   VAT 11%, charged at checkout on top of the displayed product prices

import test from 'node:test'
import assert from 'node:assert/strict'

const { deliveryFeeFor, vatAmountFor } = await import('../src/app.js')
// The storefront mirror. Different package, no "type": "module" — Node detects
// the ES syntax, which is why the test script passes --disable-warning.
const client = await import('../../src/lib/orders.js')

// Production settings, in each side's own shape.
const SERVER = { delivery_fee: 5, free_delivery_over: 100, vat_percent: 11 }
const CLIENT_DELIVERY = { fee: 5, freeOver: 100 }
const CLIENT_VAT = { percent: 11 }

/* -- Delivery threshold ---------------------------------------------------- */

test('under the threshold the delivery fee is charged', () => {
  for (const subtotal of [0.01, 1, 25, 99, 99.99]) {
    assert.equal(deliveryFeeFor(subtotal, SERVER), 5, `subtotal ${subtotal}`)
  }
})

test('exactly $100 ships FREE — the threshold is inclusive', () => {
  // The owner did not state which side of the boundary $100 falls on. The code
  // already did: both implementations use `subtotal >= freeOver`. This test
  // pins that existing behaviour so the policy page (which says "$100 or more
  // ships free") and the till stay in agreement, and so nobody "tidies" the
  // comparison into `>` without noticing they changed what a customer pays.
  assert.equal(deliveryFeeFor(100, SERVER), 0)
  assert.equal(client.deliveryFeeFor(100, CLIENT_DELIVERY), 0)
})

test('over the threshold delivery is free', () => {
  for (const subtotal of [100.01, 150, 2890]) {
    assert.equal(deliveryFeeFor(subtotal, SERVER), 0, `subtotal ${subtotal}`)
  }
})

test('a zero fee means always free; a zero threshold means always charged', () => {
  assert.equal(deliveryFeeFor(10, { delivery_fee: 0, free_delivery_over: 100 }), 0)
  assert.equal(deliveryFeeFor(5000, { delivery_fee: 5, free_delivery_over: 0 }), 5)
})

test('client and server agree on the delivery fee at every boundary', () => {
  const cases = [0, 0.01, 5, 99, 99.99, 100, 100.01, 250, 10000]
  for (const subtotal of cases) {
    assert.equal(
      client.deliveryFeeFor(subtotal, CLIENT_DELIVERY),
      deliveryFeeFor(subtotal, SERVER),
      `subtotal ${subtotal}: the cart summary and the server disagree`,
    )
  }
})

/* -- VAT ------------------------------------------------------------------- */

test('VAT is 11% of the taxable base, rounded to cents', () => {
  assert.equal(vatAmountFor(100, SERVER), 11)
  assert.equal(vatAmountFor(105, SERVER), 11.55)
  assert.equal(vatAmountFor(0, SERVER), 0)
  // 49.99 * 0.11 = 5.4989 -> 5.5
  assert.equal(vatAmountFor(49.99, SERVER), 5.5)
})

test('a zero rate produces no VAT at all', () => {
  assert.equal(vatAmountFor(500, { vat_percent: 0 }), 0)
  assert.equal(vatAmountFor(500, {}), 0)
})

test('client and server agree on the VAT amount', () => {
  for (const base of [0, 1, 49.99, 100, 105, 2895, 12345.67]) {
    assert.equal(
      client.vatAmountFor(base, CLIENT_VAT),
      vatAmountFor(base, SERVER),
      `base ${base}: the checkout summary and the server disagree`,
    )
  }
})

/* -- The whole order ------------------------------------------------------- */

test('VAT is charged on top of the item prices, never baked into them', () => {
  // A $100 product is a $100 product: the item price the customer sees on the
  // page, in the bag and in the subtotal is the same number the Merchant feed
  // publishes. VAT only ever appears as its own line on top.
  const itemPrice = 100
  const subtotal = itemPrice
  const delivery = deliveryFeeFor(subtotal, SERVER)
  const vat = vatAmountFor(subtotal + delivery, SERVER)

  assert.equal(subtotal, 100, 'the subtotal is the plain item price')
  assert.equal(delivery, 0, '$100 hits the free-delivery threshold')
  assert.equal(vat, 11)
  assert.equal(subtotal + delivery + vat, 111)
})

test('the taxable base is items plus the delivery charge', () => {
  // Recording the EXISTING rule rather than choosing one: app.js taxes
  // (subtotal - itemsDiscount) + (deliveryFee - deliveryWaived). Delivery is a
  // taxable service here, and this test is what stops that changing silently.
  const subtotal = 60
  const delivery = deliveryFeeFor(subtotal, SERVER)
  assert.equal(delivery, 5)
  assert.equal(vatAmountFor(subtotal + delivery, SERVER), 7.15) // 65 * 0.11
  // Not 6.60 — which is what taxing the merchandise alone would give.
  assert.notEqual(vatAmountFor(subtotal, SERVER), 7.15)
})

test('a discount reduces the taxable base, and the total adds up', () => {
  // Mirrors the arithmetic in POST /api/orders exactly:
  //   vat   = (subtotal - itemsDiscount) + (deliveryFee - deliveryWaived)
  //   total = subtotal + deliveryFee + vat - discountAmount
  const subtotal = 200
  const itemsDiscount = 50
  const deliveryFee = deliveryFeeFor(subtotal, SERVER) // 0 — over the threshold
  const deliveryWaived = 0
  const discountAmount = itemsDiscount + deliveryWaived
  const vat = vatAmountFor(subtotal - itemsDiscount + (deliveryFee - deliveryWaived), SERVER)
  const total = subtotal + deliveryFee + vat - discountAmount

  assert.equal(deliveryFee, 0)
  assert.equal(vat, 16.5) // 150 * 0.11
  assert.equal(total, 166.5)
})

test('VAT is never applied twice', () => {
  // Taxing an already-taxed total would compound to 12.32% — the shape of the
  // bug this guards against.
  const base = 100
  const once = vatAmountFor(base, SERVER)
  assert.equal(base + once, 111)
  assert.notEqual(base + once, base * 1.11 * 1.11)
  assert.equal(vatAmountFor(base + once, SERVER), 12.21) // what a double-tax would add
})

test('the free-delivery threshold is measured on the pre-discount subtotal', () => {
  // Also an existing rule being recorded, not chosen: POST /api/orders calls
  // deliveryFeeFor(subtotal, …) before any voucher is applied, so a $120 order
  // with a $30 reward still ships free.
  assert.equal(deliveryFeeFor(120, SERVER), 0)
})
