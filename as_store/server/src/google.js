import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { normalizeEmail } from './customerAuth.js'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8081').replace(/\/$/, '')
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || `${PUBLIC_URL}/api/account/google/callback`

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])

const STATE_COOKIE = 'as_google_state'
const STATE_TTL_SECONDS = 600

export const googleEnabled = () => Boolean(CLIENT_ID && CLIENT_SECRET)

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
    'SameSite=Lax',
    ...(PUBLIC_URL.startsWith('https://') ? ['Secure'] : []),
  ].join('; ')

export function beginGoogleAuth(res, next, appReturn = '') {
  const nonce = crypto.randomBytes(16).toString('hex')
  const state = jwt.sign(
    { kind: 'google_state', nonce, next: safeNext(next), appReturn: String(appReturn || '') },
    SECRET,
    { expiresIn: STATE_TTL_SECONDS },
  )
  res.append('Set-Cookie', `${STATE_COOKIE}=${nonce}; ${cookieAttrs(STATE_TTL_SECONDS)}`)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
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
  return { next: safeNext(payload.next), appReturn: String(payload.appReturn || '') }
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
  if (c.aud !== CLIENT_ID) throw new Error('id_token was not issued for this app')
  if (!c.exp || c.exp * 1000 <= Date.now()) throw new Error('id_token has expired')

  const email = normalizeEmail(c.email)
  if (!email) throw new Error('That Google account has no usable email address')
  if (c.email_verified === false) throw new Error('That Google email address isn’t verified')

  return { email, name: String(c.name || '').trim() }
}

export async function finishGoogleAuth(req, res) {
  res.append('Set-Cookie', `${STATE_COOKIE}=; ${cookieAttrs(0)}`)
  const { next, appReturn } = verifyState(req)
  try {
    if (req.query.error) throw new Error('Google sign-in was cancelled')
    const code = String(req.query.code || '')
    if (!code) throw new Error('Google sign-in was cancelled')

    const { id_token: idToken } = await exchangeCode(code)
    return { ...checkClaims(idToken), next, appReturn }
  } catch (e) {
    e.next = next
    e.appReturn = appReturn
    throw e
  }
}
