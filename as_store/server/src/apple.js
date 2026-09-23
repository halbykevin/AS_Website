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
//
// The website signs in with Apple too (see "The website's flow" below). Same
// verification, different front door: a browser is sent to Apple's page and
// Apple posts the token back, where the app is handed it by iOS.

import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { normalizeEmail } from './customerAuth.js'
import { readCookie, safeNext } from './google.js'

const ISSUER = 'https://appleid.apple.com'
const AUTHORIZE_URL = 'https://appleid.apple.com/auth/authorize'
const JWKS_URL = 'https://appleid.apple.com/auth/keys'
const TOKEN_URL = 'https://appleid.apple.com/auth/token'
const REVOKE_URL = 'https://appleid.apple.com/auth/revoke'

const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8081').replace(/\/$/, '')
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

// Every bundle id whose tokens we accept. Defaults to the iOS app's own id so a
// fresh deployment works without new env.
//
// That id is `lb.com.as.store`, **not** the `lb.com.as.company` the Android
// package uses: the App Store Connect record was created against the former and
// a record's bundle id cannot be renamed, only re-picked from identifiers that
// exist. The two stores keep separate identifiers on purpose — nothing here or
// in the app depends on them matching, but this constant does have to match the
// app's, or every token is rejected for the wrong audience.
const BUNDLE_IDS = String(process.env.APPLE_BUNDLE_ID || 'lb.com.as.store')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// The website's own client. A web page cannot sign in *as* the app: Apple issues
// a browser's token to a **Services ID**, a separate identifier made in the
// developer portal, so that is the audience a web token carries. Apple's `sub`
// is per developer team, not per client, which is why one Apple account arrives
// with the same `sub` from the iPhone and from the website and lands on one
// customer here rather than two. Empty = the website does not offer Apple.
const SERVICES_ID = String(process.env.APPLE_SERVICES_ID || '').trim()

const AUDIENCES = SERVICES_ID ? [...BUNDLE_IDS, SERVICES_ID] : BUNDLE_IDS

// Where Apple returns a browser to. It has to be listed, character for
// character, under the Services ID's "Return URLs" in the developer portal.
export const APPLE_REDIRECT_URI =
  process.env.APPLE_REDIRECT_URI || `${PUBLIC_URL}/api/account/apple/callback`

const TEAM_ID = process.env.APPLE_TEAM_ID || ''
const KEY_ID = process.env.APPLE_KEY_ID || ''
// The .p8 contents. Newlines survive a single-line env var as literal "\n".
const PRIVATE_KEY = (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

// The app's sign-in. The website's is `appleWebEnabled`, and the two are
// reported separately because the app reads this flag and must not start hiding
// its native button over something only the website needs.
export const appleEnabled = () => BUNDLE_IDS.length > 0
// Apple will only return a browser to an https address — never plain http, and
// so never a dev server — so without one the button would lead to an Apple error
// page. It stays hidden rather than be offered and fail.
export const appleWebEnabled = () =>
  Boolean(SERVICES_ID) && APPLE_REDIRECT_URI.startsWith('https://')
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
//
// `audience` narrows which client the token must have been minted for: the
// website's callback accepts only the Services ID's, so a token lifted from the
// app cannot be posted there.
export async function verifyAppleIdentityToken(identityToken, nonce, { audience = AUDIENCES } = {}) {
  if (!appleEnabled()) throw new Error('Apple sign-in is not configured')
  const token = String(identityToken || '')
  if (!token) throw new Error('Apple returned no identity token')

  const key = await publicKeyFor(headerOf(token).kid)
  let claims
  try {
    claims = jwt.verify(token, key, {
      algorithms: ['RS256'],
      issuer: ISSUER,
      audience,
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

/* ------------------------------------------------------------ The website's flow */

// A browser has no Apple sheet to ask, so it is sent to Apple's page and Apple
// sends it back. That return differs from Google's in the one way that shapes
// this code: Apple comes back with a **POST** (`response_mode=form_post`, the
// only mode Apple allows once a name or email is requested), and a POST from
// appleid.apple.com is a cross-site request. A `SameSite=Lax` cookie — what
// Google's state rides on — is not sent with one, so this cookie is
// `SameSite=None`.
//
// That is still safe, because what the cookie proves is a pairing, not a
// secret: the signed state names a nonce, this browser's cookie must hold the
// same nonce, and Apple must have signed that nonce into the token. A forged
// POST from another site carries the forger's state, whose nonce the victim's
// cookie does not match — which is what stops someone being signed in to an
// account that isn't theirs.

const STATE_COOKIE = 'as_apple_state'
const STATE_TTL_SECONDS = 600

// Secure is mandatory with SameSite=None; the flow only runs over https anyway
// (appleWebEnabled).
const stateCookie = (value, maxAge) =>
  [
    `${STATE_COOKIE}=${value}`,
    `Max-Age=${maxAge}`,
    'Path=/api/account/apple',
    'HttpOnly',
    'SameSite=None',
    'Secure',
  ].join('; ')

const unverified = (next) =>
  Object.assign(new Error('Sign-in could not be verified — please try again'), { next })

export function beginAppleWebAuth(res, next) {
  const nonce = crypto.randomBytes(16).toString('hex')
  const state = jwt.sign({ kind: 'apple_state', nonce, next: safeNext(next) }, SECRET, {
    expiresIn: STATE_TTL_SECONDS,
  })
  res.append('Set-Cookie', stateCookie(nonce, STATE_TTL_SECONDS))

  const params = new URLSearchParams({
    client_id: SERVICES_ID,
    redirect_uri: APPLE_REDIRECT_URI,
    response_type: 'code id_token',
    response_mode: 'form_post',
    scope: 'name email',
    state,
    nonce,
  })
  // URLSearchParams writes a space as "+"; Apple documents %20. A literal "+"
  // would have been escaped as %2B, so every "+" here is a space.
  return `${AUTHORIZE_URL}?${params.toString().replace(/\+/g, '%20')}`
}

function readState(req) {
  let payload
  try {
    payload = jwt.verify(String(req.body?.state || ''), SECRET)
  } catch {
    throw unverified('/')
  }
  if (payload?.kind !== 'apple_state') throw unverified('/')
  const next = safeNext(payload.next)

  const nonce = readCookie(req, STATE_COOKIE)
  if (!nonce) {
    throw Object.assign(new Error('Sign-in expired — please try again'), { next })
  }
  if (payload.nonce !== nonce) throw unverified(next)
  return { next, nonce }
}

// Apple posts the name once, on the first authorization, as a JSON string
// *beside* the token rather than inside it — so it is unsigned. That is fine for
// a name (fillProfile only ever fills a blank one) and is exactly why the email
// is never taken from here: the signed token's is the only one we believe.
function nameFrom(user) {
  try {
    const n = JSON.parse(String(user || '')).name || {}
    return [n.firstName, n.lastName]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 120)
  } catch {
    return ''
  }
}

// Resolves to the verified identity plus the name, where to go next, and what
// the refresh-token exchange needs. Throws with `next` attached so the caller
// can send the shopper back to where they were, and with `cancelled` when they
// simply closed Apple's page — a cancel is not an error and must not paint one.
export async function finishAppleWebAuth(req, res) {
  res.append('Set-Cookie', stateCookie('', 0))
  // Not merely tidy: with no Services ID the audience below would be '', and
  // jsonwebtoken skips an empty audience check rather than failing it.
  if (!appleWebEnabled()) throw unverified('/')
  const { next, nonce } = readState(req)
  try {
    if (req.body?.error) {
      const reason = String(req.body.error).slice(0, 60)
      throw Object.assign(new Error(`Apple sign-in ended: ${reason}`), {
        cancelled: reason === 'user_cancelled_authorize',
      })
    }
    const identity = await verifyAppleIdentityToken(req.body?.id_token, nonce, {
      audience: SERVICES_ID,
    })
    return {
      ...identity,
      name: nameFrom(req.body?.user),
      next,
      // A web code can only be exchanged by the client it was issued to, with
      // the redirect it was issued for.
      exchange: {
        code: String(req.body?.code || ''),
        clientId: SERVICES_ID,
        redirectUri: APPLE_REDIRECT_URI,
      },
    }
  } catch (e) {
    e.next = next
    throw e
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

// The client a token belongs to when none is recorded: the app's. Rows from
// before the website offered Apple all hold app-issued tokens.
const APP_CLIENT_ID = BUNDLE_IDS[0]

// Trade the one-time authorization code for a refresh token. Returns '' when
// revocation isn't configured or Apple refuses — a sign-in must not fail
// because of bookkeeping we only need at deletion time.
//
// A website code must be exchanged by the Services ID with the same redirect it
// was issued for; the app's needs neither.
export async function appleRefreshToken(code, { clientId, redirectUri } = {}) {
  if (!appleRevokeReady() || !code) return ''
  const client = clientId || APP_CLIENT_ID
  try {
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: client,
        client_secret: clientSecret(client),
        code: String(code),
        grant_type: 'authorization_code',
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
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
// here must not leave the customer's data in place. `clientId` is whoever the
// token was issued to (customers.apple_refresh_client) — Apple refuses to revoke
// a website token on the app's behalf, and the other way round.
export async function revokeAppleToken(refreshToken, clientId) {
  if (!appleRevokeReady() || !refreshToken) return false
  const client = clientId || APP_CLIENT_ID
  try {
    const resp = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: client,
        client_secret: clientSecret(client),
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
