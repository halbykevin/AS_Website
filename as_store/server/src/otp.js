// Login OTPs: generation and hashing. Delivery is by email (mailer.js
// sendOtpEmail) or WhatsApp (whatsapp.js sendOtpWhatsApp) — the shopper picks.
//
// A code is keyed by the login identifier itself: an email address for the email
// channel, a normalized mobile (digits + country code) for WhatsApp. The two can
// never collide — an email always contains '@', a mobile is always digits — so no
// channel prefix is needed and existing email codes keep working.
import crypto from 'node:crypto'

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
