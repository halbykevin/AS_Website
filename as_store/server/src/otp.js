// Login OTPs: generation and hashing. Delivery is by email (mailer.js
// sendOtpEmail) or WhatsApp (whatsapp.js sendOtpWhatsApp) — the shopper picks.
//
// A code is keyed by the login identifier itself: an email address for the email
// channel, a normalized mobile (digits + country code) for WhatsApp. The two can
// never collide — an email always contains '@', a mobile is always digits — so no
// channel prefix is needed and existing email codes keep working.
import crypto from 'node:crypto'
import { normalizeEmail } from './customerAuth.js'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

export const OTP_TTL_MINUTES = 5
export const OTP_MAX_ATTEMPTS = 5
// At most this many codes per identifier per 15 minutes (abuse guard).
export const OTP_REQUEST_CAP = 5

export const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

// Codes are short-lived 6-digit values; a keyed sha256 is plenty and keeps the
// verify path cheap. `key` is the login identifier (email).
export const hashOtp = (key, code) =>
  crypto.createHash('sha256').update(`${key}:${code}:${SECRET}`).digest('hex')

// True only when explicitly opted in (OTP_DEV_ECHO=1): the API echoes the code
// back in the response for local testing without an inbox. It is OFF by default
// — the code must never be exposed to the client in production (security). Set
// OTP_DEV_ECHO=1 in your LOCAL .env if you want the convenience during dev.
export const otpDevEcho = () => process.env.OTP_DEV_ECHO === '1'

// --- The App Review account --------------------------------------------------
// App Store and Play reviewers have to be able to sign in, and our sign-in posts
// a code to an inbox or a WhatsApp number they do not have. Apple's answer is a
// demo account; ours is exactly one email address, named in the environment,
// whose code is fixed and which is never sent anything.
//
// It is deliberately the narrowest door that solves the problem:
//   * both variables must be set, or none of this exists at all;
//   * only that one address, only the email channel, compared after the same
//     normalization every other address gets;
//   * the code is compared in constant time;
//   * everything else is untouched: real customers, attempt caps, the lot.
// Unset the two variables after review and the door is not closed, it is gone.
//
// **The code is exactly six digits, and that is forced.** Not because six digits
// are strong, but because the app's code field accepts six digits and nothing
// else, on a number-pad keyboard — a longer or alphanumeric code would be one a
// reviewer physically cannot type, and the first anyone would learn of it is a
// rejection. So the shape is validated at boot rather than discovered in review.
//
// A permanent six-digit code would be trivially brute-forced, though, and this
// path deliberately skips `consumeOtp` and with it the per-code attempt cap. So
// the cap comes back below, per IP: a million combinations against ten guesses
// per quarter-hour is not an attack anyone finishes. The blast radius is one
// demo account with no orders and no cards either way.
const REVIEW_EMAIL = normalizeEmail(process.env.REVIEW_EMAIL)
const REVIEW_CODE = String(process.env.REVIEW_CODE || '').trim()
const REVIEW_CODE_SHAPE = /^\d{6}$/

export const reviewAccountEnabled = () =>
  Boolean(REVIEW_EMAIL) && REVIEW_CODE_SHAPE.test(REVIEW_CODE)

export const isReviewIdentifier = (channel, identifier) =>
  reviewAccountEnabled() && channel === 'email' && normalizeEmail(identifier) === REVIEW_EMAIL

export function reviewCodeMatches(code) {
  if (!reviewAccountEnabled()) return false
  const given = Buffer.from(String(code || '').trim())
  const want = Buffer.from(REVIEW_CODE)
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length — hash both to a fixed width first and compare those.
  const digest = (b) => crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(digest(given), digest(want))
}

// The attempt cap, in memory: one process, one small map, and a restart during
// an attack only costs the attacker their progress too. Keyed by IP because the
// identifier is a constant here — capping by identifier would lock the reviewer
// out for everyone at once.
export const REVIEW_MAX_ATTEMPTS = 10
const REVIEW_WINDOW_MS = 15 * 60 * 1000
const reviewFailures = new Map()

const reviewKey = (ip) => String(ip || 'unknown').slice(0, 60)

export function reviewAttemptsExhausted(ip) {
  const entry = reviewFailures.get(reviewKey(ip))
  if (!entry) return false
  if (Date.now() > entry.until) {
    reviewFailures.delete(reviewKey(ip))
    return false
  }
  return entry.count >= REVIEW_MAX_ATTEMPTS
}

export function noteReviewFailure(ip) {
  const key = reviewKey(ip)
  const now = Date.now()
  const entry = reviewFailures.get(key)
  if (!entry || now > entry.until) {
    reviewFailures.set(key, { count: 1, until: now + REVIEW_WINDOW_MS })
    return
  }
  entry.count += 1
}

export const clearReviewFailures = (ip) => reviewFailures.delete(reviewKey(ip))

if (REVIEW_EMAIL && REVIEW_CODE && !reviewAccountEnabled()) {
  console.warn(
    '[review] REVIEW_CODE must be exactly 6 digits — the app’s code field accepts nothing else. The review account is OFF.',
  )
} else if (reviewAccountEnabled()) {
  console.warn(
    `[review] fixed-code sign-in is enabled for ${REVIEW_EMAIL} — unset REVIEW_EMAIL/REVIEW_CODE once the app is approved`,
  )
}
