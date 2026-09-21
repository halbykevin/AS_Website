// Sign in with Apple — the server half.
//
// Required by App Store Review Guideline 4.8: an app that offers a social login
// (we offer Google) must also offer a login that lets the customer keep their
// email address private. Apple's Hide My Email is that, and the native button is
// the only login Apple accepts as equivalent.
//
// **The trust model here is the opposite of google.js.** Google's id_token is
// read without checking its signature, and that is safe because it came to us
// straight from Google's token endpoint over TLS — the network *is* the proof.
// Apple's identity token arrives from the phone, which is to say from anyone who
// can POST to us, so the signature is the only thing that makes it evidence. We
// verify it against Apple's published keys, and pin the issuer and the audience
// (our bundle id) so a token minted for some other app cannot sign anyone in
// here.
//
// Sign-in needs no credentials at all — just the bundle id to check `aud`
// against. Token revocation does need a key (see `appleRevokeReady`), and is
// kept optional so a missing key degrades to "we could not tell Apple", never to
// "nobody can sign in".

import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { normalizeEmail } from './customerAuth.js'

const ISSUER = 'https://appleid.apple.com'
const JWKS_URL = 'https://appleid.apple.com/auth/keys'
const TOKEN_URL = 'https://appleid.apple.com/auth/token'
const REVOKE_URL = 'https://appleid.apple.com/auth/revoke'

// Every bundle id (and Services ID, if the website ever offers this) whose
// tokens we accept. Defaults to the iOS app's own id so a fresh deployment
// works without new env.
//
// That id is `lb.com.as.store`, **not** the `lb.com.as.company` the Android
// package uses: the App Store Connect record was created against the former and
// a record's bundle id cannot be renamed, only re-picked from identifiers that
// exist. The two stores keep separate identifiers on purpose — nothing here or
// in the app depends on them matching, but this constant does have to match the
// app's, or every token is rejected for the wrong audience.
const AUDIENCES = String(process.env.APPLE_BUNDLE_ID || 'lb.com.as.store')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const TEAM_ID = process.env.APPLE_TEAM_ID || ''
const KEY_ID = process.env.APPLE_KEY_ID || ''
// The .p8 contents. Newlines survive a single-line env var as literal "\n".
const PRIVATE_KEY = (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

export const appleEnabled = () => AUDIENCES.length > 0
export const appleRevokeReady = () => Boolean(TEAM_ID && KEY_ID && PRIVATE_KEY)

/* --------------------------------------------------------------- Apple's keys */

// Apple rotates its signing keys, so the set is fetched and cached rather than
// checked in. An unknown `kid` forces one refetch — that is a key rotation, not
// an attack, and refusing it would lock every customer out until a restart.
let cache = { keys: [], at: 0 }
const KEYS_TTL_MS = 60 * 60 * 1000

async function fetchKeys() {
  const resp = await fetch(JWKS_URL, { headers: { Accept: 'application/json' } })
  if (!resp.ok) throw new Error(`Apple key set unavailable (${resp.status})`)
  const body = await resp.json()
  const keys = Array.isArray(body?.keys) ? body.keys : []
  if (!keys.length) throw new Error('Apple returned an empty key set')
  cache = { keys, at: Date.now() }
  return keys
}

async function publicKeyFor(kid) {
  const fresh = Date.now() - cache.at < KEYS_TTL_MS
  let keys = fresh && cache.keys.length ? cache.keys : await fetchKeys()
  let jwk = keys.find((k) => k.kid === kid)
  if (!jwk && fresh) jwk = (await fetchKeys()).find((k) => k.kid === kid)
  if (!jwk) throw new Error('Apple sign-in could not be verified — please try again')
  return crypto.createPublicKey({ key: jwk, format: 'jwk' })
}

/* ------------------------------------------------------------- Verifying a token */

function headerOf(token) {
  const [header] = String(token || '').split('.')
  if (!header) throw new Error('Apple returned no identity token')
  try {
    return JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))
  } catch {
    throw new Error('Apple returned an unreadable identity token')
  }
}

// The nonce is Apple's replay defence: the app generates one per attempt and
// Apple echoes it into the token. Both spellings are accepted because the raw
// value is echoed for a native sign-in while some clients hash it first — this
// only ever *adds* a check, never relaxes one.
function checkNonce(claims, nonce) {
  const sent = String(nonce || '')
  if (!sent) return
  const got = String(claims.nonce || '')
  if (!got) throw new Error('Apple sign-in could not be verified — please try again')
  const hashed = crypto.createHash('sha256').update(sent).digest('hex')
  if (got !== sent && got !== hashed) {
    throw new Error('Apple sign-in could not be verified — please try again')
  }
}

// Resolves to { sub, email, emailVerified, privateEmail }. `sub` is the stable
// per-app identifier and the only claim present on *every* sign-in — the email
// and the name come back on the first authorization only, which is why the
// caller stores `sub` and never relies on the email to recognise a returning
// customer.
export async function verifyAppleIdentityToken(identityToken, nonce) {
  if (!appleEnabled()) throw new Error('Apple sign-in is not configured')
  const token = String(identityToken || '')
  if (!token) throw new Error('Apple returned no identity token')

  const key = await publicKeyFor(headerOf(token).kid)
  let claims
  try {
    claims = jwt.verify(token, key, {
      algorithms: ['RS256'],
      issuer: ISSUER,
      audience: AUDIENCES,
    })
  } catch {
    throw new Error('Apple sign-in could not be verified — please try again')
  }
  if (!claims.sub) throw new Error('Apple returned no account identifier')
  checkNonce(claims, nonce)

  // `email_verified` and `is_private_email` come back as booleans or as the
  // strings "true"/"false" depending on the flow.
  const truthy = (v) => v === true || v === 'true'
  return {
    sub: String(claims.sub),
    email: normalizeEmail(claims.email) || '',
    emailVerified: truthy(claims.email_verified),
    privateEmail: truthy(claims.is_private_email),
  }
}

/* ------------------------------------------------------- Revocation on deletion */

// Apple requires an app that deletes accounts to also revoke the tokens it was
// issued, so "delete my account" reaches Apple's side too and the customer stops
// seeing us in their Apple ID settings. Getting a refresh token to revoke means
// exchanging the authorization code at sign-in, which needs the client secret
// below — hence both are optional and both are skipped together.

function clientSecret(clientId) {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { iss: TEAM_ID, iat: now, exp: now + 300, aud: ISSUER, sub: clientId },
    PRIVATE_KEY,
    { algorithm: 'ES256', keyid: KEY_ID },
  )
}

// Trade the one-time authorization code for a refresh token. Returns '' when
// revocation isn't configured or Apple refuses — a sign-in must not fail
// because of bookkeeping we only need at deletion time.
export async function appleRefreshToken(code, clientId = AUDIENCES[0]) {
  if (!appleRevokeReady() || !code) return ''
  try {
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret(clientId),
        code: String(code),
        grant_type: 'authorization_code',
      }),
    })
    if (!resp.ok) {
      console.warn(`[apple] code exchange failed (${resp.status}) — deletion will not revoke`)
      return ''
    }
    const body = await resp.json()
    return String(body?.refresh_token || '')
  } catch (e) {
    console.warn('[apple] code exchange failed:', e?.message || e)
    return ''
  }
}

// Best effort by design: the account is being deleted either way, and a failure
// here must not leave the customer's data in place.
export async function revokeAppleToken(refreshToken, clientId = AUDIENCES[0]) {
  if (!appleRevokeReady() || !refreshToken) return false
  try {
    const resp = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret(clientId),
        token: String(refreshToken),
        token_type_hint: 'refresh_token',
      }),
    })
    if (!resp.ok) console.warn(`[apple] token revocation failed (${resp.status})`)
    return resp.ok
  } catch (e) {
    console.warn('[apple] token revocation failed:', e?.message || e)
    return false
  }
}
