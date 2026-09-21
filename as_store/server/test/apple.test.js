// Sign in with Apple — the signature check is the whole security model here.
//
// The identity token arrives from the phone, i.e. from anyone who can reach the
// endpoint, so every one of these cases is a way someone could try to be signed
// in as somebody else. They run against a key pair generated here, with Apple's
// key endpoint stubbed, so nothing touches the network.

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

process.env.APPLE_BUNDLE_ID = 'lb.com.as.store'

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const KID = 'test-key-1'
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' }] }

// Apple's key endpoint, without Apple.
const realFetch = globalThis.fetch
globalThis.fetch = async (url) =>
  String(url).includes('appleid.apple.com/auth/keys')
    ? new Response(JSON.stringify(jwks), { headers: { 'Content-Type': 'application/json' } })
    : realFetch(url)

const { verifyAppleIdentityToken } = await import('../src/apple.js')

const sign = (claims = {}, key = privateKey) =>
  jwt.sign(
    {
      iss: 'https://appleid.apple.com',
      aud: 'lb.com.as.store',
      sub: '001234.abcdef.5678',
      email: 'Someone@Example.com',
      email_verified: 'true',
      exp: Math.floor(Date.now() / 1000) + 600,
      ...claims,
    },
    key,
    { algorithm: 'RS256', keyid: KID },
  )

const rejects = (token, nonce) =>
  assert.rejects(() => verifyAppleIdentityToken(token, nonce), /could not be verified|no identity token|no account identifier|unreadable identity token/)

test('accepts a token Apple signed for this app', async () => {
  const identity = await verifyAppleIdentityToken(sign())
  assert.equal(identity.sub, '001234.abcdef.5678')
  assert.equal(identity.email, 'someone@example.com') // normalized, as everywhere else
  assert.equal(identity.emailVerified, true)
  assert.equal(identity.privateEmail, false)
})

test('reads Apple’s string booleans as booleans', async () => {
  const relay = await verifyAppleIdentityToken(
    sign({ email: 'abc123@privaterelay.appleid.com', is_private_email: 'true' }),
  )
  assert.equal(relay.privateEmail, true)
  assert.equal(relay.email, 'abc123@privaterelay.appleid.com')

  const bool = await verifyAppleIdentityToken(sign({ email_verified: true, is_private_email: false }))
  assert.equal(bool.emailVerified, true)
  assert.equal(bool.privateEmail, false)
})

test('refuses a token signed by anyone else', async () => {
  const attacker = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  await rejects(sign({}, attacker))
})

test('refuses a token minted for a different app', async () => {
  await rejects(sign({ aud: 'com.someone.else' }))
})

test('refuses a token from a different issuer', async () => {
  await rejects(sign({ iss: 'https://appleid.example.com' }))
})

test('refuses an expired token', async () => {
  await rejects(sign({ exp: Math.floor(Date.now() / 1000) - 60 }))
})

test('refuses a token with no subject', async () => {
  await rejects(sign({ sub: undefined }))
})

test('refuses a replayed token when the nonce does not match', async () => {
  // Apple echoes the nonce the app generated; a token captured from another
  // sign-in carries that attempt's nonce, not this one's.
  await rejects(sign({ nonce: 'nonce-from-another-attempt' }), 'nonce-for-this-attempt')
  await rejects(sign({}), 'nonce-for-this-attempt') // no nonce echoed at all
})

test('accepts the nonce raw or hashed', async () => {
  const nonce = 'nonce-for-this-attempt'
  const hashed = crypto.createHash('sha256').update(nonce).digest('hex')
  assert.equal((await verifyAppleIdentityToken(sign({ nonce }), nonce)).sub, '001234.abcdef.5678')
  assert.equal((await verifyAppleIdentityToken(sign({ nonce: hashed }), nonce)).sub, '001234.abcdef.5678')
})

test('refuses an empty or malformed token', async () => {
  await rejects('')
  await rejects('not-a-jwt')
})
