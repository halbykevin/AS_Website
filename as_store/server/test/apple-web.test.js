// Sign in with Apple on the website — the redirect flow in apple.js.
//
// The callback is a public POST that turns a token into a session, so beyond the
// signature checks apple.test.js covers, each case here is a way to be signed in
// as the wrong person: a forged or replayed state, a callback posted from
// another site into someone else's browser, a token minted for the app rather
// than the website. Apple's key endpoint is stubbed; nothing touches the network.

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

const SERVICES_ID = 'lb.com.as.store.web'
const BUNDLE_ID = 'lb.com.as.store'
process.env.APPLE_BUNDLE_ID = BUNDLE_ID
process.env.APPLE_SERVICES_ID = SERVICES_ID
process.env.PUBLIC_URL = 'https://store-api.example.test'
process.env.JWT_SECRET = 'test-secret'

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const KID = 'test-key-1'
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' }] }

const realFetch = globalThis.fetch
globalThis.fetch = async (url) =>
  String(url).includes('appleid.apple.com/auth/keys')
    ? new Response(JSON.stringify(jwks), { headers: { 'Content-Type': 'application/json' } })
    : realFetch(url)

const { appleWebEnabled, beginAppleWebAuth, finishAppleWebAuth, APPLE_REDIRECT_URI } = await import(
  '../src/apple.js'
)

const idToken = (claims = {}) =>
  jwt.sign(
    {
      iss: 'https://appleid.apple.com',
      aud: SERVICES_ID,
      sub: '001234.abcdef.5678',
      email: 'someone@example.com',
      email_verified: 'true',
      exp: Math.floor(Date.now() / 1000) + 600,
      ...claims,
    },
    privateKey,
    { algorithm: 'RS256', keyid: KID },
  )

const fakeRes = () => ({
  cookies: [],
  append(name, value) {
    if (name === 'Set-Cookie') this.cookies.push(value)
  },
})

// Start a sign-in the way the button does; returns what Apple would be handed
// and the cookie this browser now holds.
function start(next = '/checkout') {
  const res = fakeRes()
  const url = new URL(beginAppleWebAuth(res, next))
  const nonce = /as_apple_state=([^;]+)/.exec(res.cookies[0])[1]
  return { url, res, nonce, state: url.searchParams.get('state') }
}

// Apple's POST back to the callback, from a browser carrying `cookie`.
const callback = (body, cookie) => ({
  body,
  headers: cookie ? { cookie: `as_apple_state=${cookie}` } : {},
})

test('is offered only with a Services ID and an https return address', () => {
  assert.equal(appleWebEnabled(), true)
  assert.equal(APPLE_REDIRECT_URI, 'https://store-api.example.test/api/account/apple/callback')
})

test('sends the browser to Apple as the website, asking for a form POST back', () => {
  const { url, res, nonce } = start()
  assert.equal(url.origin + url.pathname, 'https://appleid.apple.com/auth/authorize')
  assert.equal(url.searchParams.get('client_id'), SERVICES_ID)
  assert.equal(url.searchParams.get('redirect_uri'), APPLE_REDIRECT_URI)
  assert.equal(url.searchParams.get('response_type'), 'code id_token')
  assert.equal(url.searchParams.get('response_mode'), 'form_post')
  assert.equal(url.searchParams.get('scope'), 'name email')
  assert.equal(url.searchParams.get('nonce'), nonce)
  assert.match(url.search, /response_type=code%20id_token/) // %20, as Apple documents — not "+"

  // Apple's return is a cross-site POST: a Lax cookie would not come back with it.
  const cookie = res.cookies[0]
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=None', 'Path=/api/account/apple']) {
    assert.ok(cookie.includes(attr), `cookie should carry ${attr}: ${cookie}`)
  }
})

test('signs in with the token Apple posts back, and takes the name from `user`', async () => {
  const { nonce, state } = start('/checkout')
  const res = fakeRes()
  const out = await finishAppleWebAuth(
    callback(
      {
        state,
        code: 'one-time-code',
        id_token: idToken({ nonce }),
        user: JSON.stringify({ name: { firstName: 'Jane', lastName: 'Doe' }, email: 'someone@example.com' }),
      },
      nonce,
    ),
    res,
  )
  assert.equal(out.sub, '001234.abcdef.5678')
  assert.equal(out.email, 'someone@example.com')
  assert.equal(out.emailVerified, true)
  assert.equal(out.name, 'Jane Doe')
  assert.equal(out.next, '/checkout')
  assert.deepEqual(out.exchange, {
    code: 'one-time-code',
    clientId: SERVICES_ID,
    redirectUri: APPLE_REDIRECT_URI,
  })
  assert.match(res.cookies[0], /as_apple_state=;.*Max-Age=0/) // the state is spent
})

test('never takes the email from the unsigned `user` field', async () => {
  const { nonce, state } = start()
  const out = await finishAppleWebAuth(
    callback(
      {
        state,
        id_token: idToken({ nonce, email: 'real@example.com' }),
        user: JSON.stringify({ email: 'victim@example.com' }),
      },
      nonce,
    ),
    fakeRes(),
  )
  assert.equal(out.email, 'real@example.com')
  assert.equal(out.name, '')
})

test('refuses a callback posted into a browser that never started this sign-in', async () => {
  // Login CSRF: someone completes Apple with their own account, then gets a
  // victim's browser to post the result. The victim's cookie — from a sign-in
  // of their own, or none at all — does not hold the attacker's nonce.
  const attacker = start()
  const victim = start()
  const body = { state: attacker.state, id_token: idToken({ nonce: attacker.nonce }) }

  await assert.rejects(() => finishAppleWebAuth(callback(body, victim.nonce), fakeRes()), /could not be verified/)
  await assert.rejects(
    () => finishAppleWebAuth(callback(body, null), fakeRes()),
    (e) => /expired/.test(e.message) && e.next === '/checkout',
  )
})

test('refuses a state the server did not sign', async () => {
  const { nonce } = start()
  const forged = jwt.sign({ kind: 'apple_state', nonce, next: '/' }, 'someone-elses-secret')
  await assert.rejects(
    () => finishAppleWebAuth(callback({ state: forged, id_token: idToken({ nonce }) }, nonce), fakeRes()),
    /could not be verified/,
  )
  const googleState = jwt.sign({ kind: 'google_state', nonce, next: '/' }, 'test-secret')
  await assert.rejects(
    () => finishAppleWebAuth(callback({ state: googleState, id_token: idToken({ nonce }) }, nonce), fakeRes()),
    /could not be verified/,
  )
})

test('refuses a token Apple minted for the app rather than the website', async () => {
  const { nonce, state } = start()
  await assert.rejects(
    () => finishAppleWebAuth(callback({ state, id_token: idToken({ nonce, aud: BUNDLE_ID }) }, nonce), fakeRes()),
    /could not be verified/,
  )
})

test('refuses a token from another sign-in attempt', async () => {
  const { nonce, state } = start()
  await assert.rejects(
    () =>
      finishAppleWebAuth(callback({ state, id_token: idToken({ nonce: 'some-other-attempt' }) }, nonce), fakeRes()),
    /could not be verified/,
  )
})

test('a closed Apple page is a cancel, not an error, and keeps where the shopper was going', async () => {
  const { nonce, state } = start('/checkout')
  await assert.rejects(
    () => finishAppleWebAuth(callback({ state, error: 'user_cancelled_authorize' }, nonce), fakeRes()),
    (e) => e.cancelled === true && e.next === '/checkout',
  )
  const other = start('/account')
  await assert.rejects(
    () => finishAppleWebAuth(callback({ state: other.state, error: 'invalid_request' }, other.nonce), fakeRes()),
    (e) => !e.cancelled && e.next === '/account',
  )
})

test('an off-site `next` is not followed', async () => {
  const { nonce, state } = start('//evil.example/steal')
  const out = await finishAppleWebAuth(callback({ state, id_token: idToken({ nonce }) }, nonce), fakeRes())
  assert.equal(out.next, '/')
})

test('without a Services ID the callback refuses everything, even a perfectly signed token', async () => {
  // jsonwebtoken skips an empty audience rather than failing it, so this is
  // the guard that stops "not configured" meaning "any app's token will do".
  delete process.env.APPLE_SERVICES_ID
  const off = await import('../src/apple.js?noweb')
  process.env.APPLE_SERVICES_ID = SERVICES_ID
  assert.equal(off.appleWebEnabled(), false)

  const nonce = 'n'
  const state = jwt.sign({ kind: 'apple_state', nonce, next: '/' }, 'test-secret')
  await assert.rejects(
    () => off.finishAppleWebAuth(callback({ state, id_token: idToken({ nonce, aud: 'com.any.app' }) }, nonce), fakeRes()),
    /could not be verified/,
  )
})

test('stays hidden when Apple could not return to the configured address', async () => {
  // A second copy of the module reads the environment afresh.
  process.env.APPLE_REDIRECT_URI = 'http://localhost:8081/api/account/apple/callback'
  const dev = await import('../src/apple.js?http')
  assert.equal(dev.appleWebEnabled(), false)
  delete process.env.APPLE_REDIRECT_URI
})
