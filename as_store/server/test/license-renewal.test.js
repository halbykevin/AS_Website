// AS-Punch licence renewal (src/licenseRenewal.js): the pieces that decide
// whether a code is worth a round trip, what the customer is told, how a paid
// renewal is retried, and the signature the licence server verifies.
//
// The signature is the contract with the AS-Punch licence server
// (license-server/middlewares/storeAuth.js): HMAC-SHA256 over
// `${timestamp}.${rawBody}`, hex, prefixed "sha256=". The vector below was
// computed independently of this module; if it fails, every renewal report
// is refused with a 401 and paid renewals pile up as "pending".

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const { isRenewalCode, retryDelaySeconds, renewalRefusal, signBody, licenseRenewalJson } = await import(
  '../src/licenseRenewal.js'
)

test('only licence-server-shaped codes are worth a round trip', () => {
  assert.equal(isRenewalCode('UeDA7-AjGgJXBsLgmIvxjYFD'), true) // what the server mints: 24 base64url chars
  for (const bad of ['', 'short', '../../etc/passwd', 'x'.repeat(65), 'has space in it 123456', null, undefined, 42]) {
    assert.equal(isRenewalCode(bad), false, String(bad))
  }
})

test('the signature is exactly what the licence server verifies', () => {
  const raw = JSON.stringify({ code: 'UeDA7-AjGgJXBsLgmIvxjYFD', orderId: 42, amount: 50, currency: 'USD' })
  const expected = `sha256=${crypto.createHmac('sha256', 'shared-secret').update(`1790000000.${raw}`).digest('hex')}`
  assert.equal(signBody(raw, '1790000000', 'shared-secret'), expected)
  // Any change to the body — a different amount — is a different signature.
  assert.notEqual(signBody(raw.replace('50', '5'), '1790000000', 'shared-secret'), expected)
})

test('a paid renewal is retried with backoff, capped at an hour, never abandoned', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(retryDelaySeconds), [30, 60, 120, 240, 480])
  assert.equal(retryDelaySeconds(8), 3600)
  assert.equal(retryDelaySeconds(500), 3600)
})

test('only a payable USD code can be paid, and every refusal says why', () => {
  assert.equal(renewalRefusal({ status: 'payable', amount: 50, currency: 'USD' }), null)
  assert.match(renewalRefusal({ status: 'payable', amount: 50, currency: 'EUR' }), /cannot be renewed online/)
  assert.match(renewalRefusal({ status: 'payable', amount: 0.5, currency: 'USD' }), /cannot be renewed online/)
  assert.match(renewalRefusal({ status: 'paid' }), /already been renewed/)
  assert.match(renewalRefusal({ status: 'expired' }), /Open Renew again/)
  assert.match(renewalRefusal({ status: 'superseded' }), /Open Renew again/)
  assert.match(renewalRefusal({ status: 'unavailable' }), /contact support/)
  assert.match(renewalRefusal({ status: 'not_found' }), /not valid/)
  assert.match(renewalRefusal(null), /not valid/)
})

test('orders expose the renewal only when they are one', () => {
  assert.equal(licenseRenewalJson({ license_renewal_code: null }), null)
  assert.deepEqual(
    licenseRenewalJson({
      license_renewal_code: 'UeDA7-AjGgJXBsLgmIvxjYFD',
      license_renewal_status: 'applied',
      license_renewal_result: { companyName: 'Roy Gym', periodMonths: 1, newExpiresAt: '2026-11-05T12:00:00.000Z' },
    }),
    { status: 'applied', companyName: 'Roy Gym', periodMonths: 1, newExpiresAt: '2026-11-05T12:00:00.000Z', reason: null },
  )
})
