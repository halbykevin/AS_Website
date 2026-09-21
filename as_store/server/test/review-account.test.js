// The App Review account is a deliberate hole in the sign-in, so its edges are
// the thing worth testing: it must open for exactly one address with exactly one
// code, and be absent entirely when it is not configured.
//
// The predicates read the environment once at import, which is what the server
// does too — so each configuration gets its own fresh import.

import test from 'node:test'
import assert from 'node:assert/strict'

const load = async (env, tag) => {
  for (const [k, v] of Object.entries(env)) {
    if (v === null) delete process.env[k]
    else process.env[k] = v
  }
  // A query string forces a fresh module instance, so module-level env reads run again.
  return import(`../src/otp.js?review=${tag}`)
}

const CODE = '481903' // six digits: the only shape the app's code field accepts

test('off when nothing is configured', async () => {
  const otp = await load({ REVIEW_EMAIL: null, REVIEW_CODE: null }, 'off')
  assert.equal(otp.reviewAccountEnabled(), false)
  assert.equal(otp.isReviewIdentifier('email', 'appreview@as.com.lb'), false)
  assert.equal(otp.reviewCodeMatches(CODE), false)
  assert.equal(otp.reviewCodeMatches(''), false)
})

test('off when only one half is configured', async () => {
  const noCode = await load({ REVIEW_EMAIL: 'appreview@as.com.lb', REVIEW_CODE: null }, 'half1')
  assert.equal(noCode.reviewAccountEnabled(), false)

  const noEmail = await load({ REVIEW_EMAIL: null, REVIEW_CODE: CODE }, 'half2')
  assert.equal(noEmail.reviewAccountEnabled(), false)
})

// A code the reviewer cannot type is worse than none: the failure would surface
// as a rejection, not as an error anyone here would see.
test('off when the code is not exactly six digits', async () => {
  for (const [code, why] of [
    ['12345', 'too short'],
    ['1234567', 'too long'],
    ['as-review-2026', 'letters the number pad cannot produce'],
    ['12 34 56', 'spaces'],
    ['', 'empty'],
  ]) {
    const otp = await load(
      { REVIEW_EMAIL: 'appreview@as.com.lb', REVIEW_CODE: code },
      `shape-${Buffer.from(code).toString('hex')}`,
    )
    assert.equal(otp.reviewAccountEnabled(), false, why)
    assert.equal(otp.isReviewIdentifier('email', 'appreview@as.com.lb'), false, why)
    assert.equal(otp.reviewCodeMatches(code), false, why)
  }
})

test('opens for exactly one address, and only on the email channel', async () => {
  const otp = await load({ REVIEW_EMAIL: 'AppReview@AS.com.lb', REVIEW_CODE: CODE }, 'on')
  assert.equal(otp.reviewAccountEnabled(), true)

  // Normalized the same way every other address is, so case and spacing can't
  // be used to slip past it — or to miss it.
  assert.equal(otp.isReviewIdentifier('email', 'appreview@as.com.lb'), true)
  assert.equal(otp.isReviewIdentifier('email', '  AppReview@as.com.LB  '), true)

  assert.equal(otp.isReviewIdentifier('email', 'someone@as.com.lb'), false)
  assert.equal(otp.isReviewIdentifier('email', 'appreview@example.com'), false)
  assert.equal(otp.isReviewIdentifier('email', ''), false)
  // A mobile number can never reach it, whatever it contains.
  assert.equal(otp.isReviewIdentifier('whatsapp', 'appreview@as.com.lb'), false)
  assert.equal(otp.isReviewIdentifier('whatsapp', '96170123456'), false)
})

test('accepts the fixed code and nothing near it', async () => {
  const otp = await load({ REVIEW_EMAIL: 'appreview@as.com.lb', REVIEW_CODE: CODE }, 'code')
  assert.equal(otp.reviewCodeMatches(CODE), true)
  assert.equal(otp.reviewCodeMatches(`  ${CODE}  `), true) // typed with a stray space

  assert.equal(otp.reviewCodeMatches(CODE.slice(0, -1)), false)
  assert.equal(otp.reviewCodeMatches(`${CODE}9`), false)
  assert.equal(otp.reviewCodeMatches('000000'), false)
  assert.equal(otp.reviewCodeMatches(''), false)
  assert.equal(otp.reviewCodeMatches(null), false)
  assert.equal(otp.reviewCodeMatches(undefined), false)
})

// Six digits are only a million guesses, and this path skips the per-code
// attempt cap that protects a real OTP — so it brings its own.
test('caps guesses per caller, and a success clears the count', async () => {
  const otp = await load({ REVIEW_EMAIL: 'appreview@as.com.lb', REVIEW_CODE: CODE }, 'cap')
  const ip = '203.0.113.7'

  assert.equal(otp.reviewAttemptsExhausted(ip), false)
  for (let i = 0; i < otp.REVIEW_MAX_ATTEMPTS; i += 1) {
    assert.equal(otp.reviewAttemptsExhausted(ip), false, `attempt ${i + 1} should be allowed`)
    otp.noteReviewFailure(ip)
  }
  assert.equal(otp.reviewAttemptsExhausted(ip), true)

  // One caller's guesses never lock out another — the reviewer must still get in.
  assert.equal(otp.reviewAttemptsExhausted('198.51.100.2'), false)

  otp.clearReviewFailures(ip)
  assert.equal(otp.reviewAttemptsExhausted(ip), false)
})

test('an unknown caller is still counted, not waved through', async () => {
  const otp = await load({ REVIEW_EMAIL: 'appreview@as.com.lb', REVIEW_CODE: CODE }, 'cap-unknown')
  for (let i = 0; i < otp.REVIEW_MAX_ATTEMPTS; i += 1) otp.noteReviewFailure(undefined)
  assert.equal(otp.reviewAttemptsExhausted(undefined), true)
  assert.equal(otp.reviewAttemptsExhausted(''), true)
})
