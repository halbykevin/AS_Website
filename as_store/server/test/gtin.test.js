// GTIN validation on the write path.
//
// This is the gate that keeps invented barcodes out of the catalogue in the
// first place. A wrong GTIN is worse than none at all: Google matches offers to
// products by it, so one bad number attaches our listing to somebody else's
// product, and it is the kind of error nobody notices until an account is
// suspended for misrepresentation.
//
// The storefront mirrors this logic in src/lib/merchant.js (isValidGtin) and
// re-checks on read, so a value that predates this validation still cannot
// reach the feed. The two must agree — as_store/test/merchant.test.js asserts
// the same cases from the other side.

import test from 'node:test'
import assert from 'node:assert/strict'

const { isValidGtin, normalizeGtin } = await import('../src/app.js')

test('real barcodes of every supported length are accepted', () => {
  assert.ok(isValidGtin('96385074')) // GTIN-8
  assert.ok(isValidGtin('012345678905')) // UPC-12
  assert.ok(isValidGtin('0194253715818')) // EAN-13
  assert.ok(isValidGtin('00012345678905')) // GTIN-14
})

test('formatting is tolerated but the digits are not changed', () => {
  assert.equal(normalizeGtin('019-425 371 5818'), '0194253715818')
  assert.equal(normalizeGtin(' 0194253715818 '), '0194253715818')
  assert.equal(normalizeGtin("'0194253715818"), '0194253715818')
})

test('a wrong check digit is rejected', () => {
  assert.ok(!isValidGtin('0194253715819'))
  assert.throws(() => normalizeGtin('0194253715819'), /check digit/)
})

test('an internal reference is never mistaken for a barcode', () => {
  // The exact failure mode this guards: someone pastes a SKU, an order number
  // or a product id into the barcode box.
  for (const notAGtin of ['SKU-101', '101', '1234567890123', '0000000000000', '9999']) {
    assert.ok(!isValidGtin(notAGtin), notAGtin)
    assert.throws(() => normalizeGtin(notAGtin), notAGtin)
  }
})

test('blank clears the field rather than failing', () => {
  // Empty is the correct, common answer — most of the catalogue has no barcode
  // yet, and saving an unrelated edit must not demand one.
  for (const blank of ['', '   ', null, undefined]) {
    assert.equal(normalizeGtin(blank), '')
  }
})

test('normalizeGtin marks its failure as a client error, not a crash', () => {
  // The route's error handler only reveals a message for 4xx; without this the
  // admin would see a bare 500 and no idea what was wrong with the number.
  try {
    normalizeGtin('1234567890123')
    assert.fail('should have thrown')
  } catch (err) {
    assert.equal(err.status, 400)
    assert.match(err.message, /GTIN/)
  }
})
