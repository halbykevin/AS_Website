// Google sign-in — OAuth 2.0 authorization code flow, no SDK, no extra dependency.
//
// The shopper leaves from /api/account/google/start and returns to
// /api/account/google/callback, where we swap the code for an id_token over a
// direct server-to-server TLS call to Google, authenticated with our client
// secret. That channel is trusted (we called Google ourselves and nobody can
// answer in its place), so the id_token's signature doesn't need re-verifying —
// its claims still do, which is what checkClaims() below is for.
//
// Inert unless GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are both set:
// googleEnabled() stays false and the login page never offers the button.

import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { normalizeEmail } from './customerAuth.js'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8081').replace(/\/$/, '')
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

// Must match a redirect URI registered on the Google Cloud OAuth client exactly,
// character for character, or Google refuses the request with redirect_uri_mismatch.
export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || `${PUBLIC_URL}/api/account/google/callback`

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])

const STATE_COOKIE = 'as_google_state'
const STATE_TTL_SECONDS = 600

export const googleEnabled = () => Boolean(CLIENT_ID && CLIENT_SECRET)

// Where to send the shopper once they're signed in. Only same-site paths are
// allowed: anything else would turn this endpoint into an open redirect. The
// fallback mirrors AFTER_SIGN_IN on the storefront (the client normally passes
// an explicit ?next=, so this only catches a hand-made link).
export const safeNext = (value) => {
  const n = String(value || '')
  return n.startsWith('/') && !n.startsWith('//') ? n : '/'
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

const cookieAttrs = (maxAge) =>
  [
    `Max-Age=${maxAge}`,
    'Path=/api/account/google',
    'HttpOnly',
    // Lax still reaches us: Google's callback is a top-level GET navigation.
    'SameSite=Lax',
    ...(PUBLIC_URL.startsWith('https://') ? ['Secure'] : []),
  ].join('; ')

// Start the flow: mint a state that carries the post-login destination, pin it to
// this browser with a cookie, and return the Google URL to send them to.
//
// The state is signed AND cookie-bound on purpose. Signing keeps an attacker from
// tampering with `next`; the cookie is what proves the callback is answering the
// same browser's request rather than one an attacker started.
export function beginGoogleAuth(res, next) {
  const nonce = crypto.randomBytes(16).toString('hex')
  const state = jwt.sign({ kind: 'google_state', nonce, next: safeNext(next) }, SECRET, {
    expiresIn: STATE_TTL_SECONDS,
  })
  res.append('Set-Cookie', `${STATE_COOKIE}=${nonce}; ${cookieAttrs(STATE_TTL_SECONDS)}`)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // Always let them choose the account — a shared device shouldn't silently
    // sign in whoever used it last.
    prompt: 'select_account',
  })
  return `${AUTH_ENDPOINT}?${params}`
}

function verifyState(req) {
  const cookie = readCookie(req, STATE_COOKIE)
  if (!cookie) throw new Error('Sign-in expired — please try again')
  let payload
  try {
    payload = jwt.verify(String(req.query.state || ''), SECRET)
  } catch {
    throw new Error('Sign-in could not be verified — please try again')
  }
  if (payload.kind !== 'google_state' || payload.nonce !== cookie) {
    throw new Error('Sign-in could not be verified — please try again')
  }
  return safeNext(payload.next)
}

async function exchangeCode(code) {
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Google token exchange failed (${resp.status}): ${text}`)
  }
  return resp.json()
}

function checkClaims(idToken) {
  const [, payload] = String(idToken || '').split('.')
  if (!payload) throw new Error('Google returned no id_token')
  const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))

  if (!ISSUERS.has(c.iss)) throw new Error('Unexpected id_token issuer')
  // Guards against a token minted for someone else's app being replayed at ours.
  if (c.aud !== CLIENT_ID) throw new Error('id_token was not issued for this app')
  if (!c.exp || c.exp * 1000 <= Date.now()) throw new Error('id_token has expired')

  const email = normalizeEmail(c.email)
  if (!email) throw new Error('That Google account has no usable email address')
  // An unverified address would let someone sign in as a shopper who owns it.
  if (c.email_verified === false) throw new Error('That Google email address isn’t verified')

  return { email, name: String(c.name || '').trim() }
}

// Finish the flow. Returns { email, name, next }; throws with a message safe to
// show the shopper. Clears the state cookie either way — it's single-use.
export async function finishGoogleAuth(req, res) {
  res.append('Set-Cookie', `${STATE_COOKIE}=; ${cookieAttrs(0)}`)
  const next = verifyState(req)
  if (req.query.error) throw new Error('Google sign-in was cancelled')
  const code = String(req.query.code || '')
  if (!code) throw new Error('Google sign-in was cancelled')

  const { id_token: idToken } = await exchangeCode(code)
  return { ...checkClaims(idToken), next }
}
