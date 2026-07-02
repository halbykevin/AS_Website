// Login OTPs: generation, hashing, and delivery.
//
// Delivery is pluggable — the channel (WhatsApp Cloud API vs. an SMS gateway)
// hasn't been chosen yet, so sendOtp() currently only logs the code. When the
// channel lands, wire it here and nothing else needs to change.
import crypto from 'node:crypto'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

export const OTP_TTL_MINUTES = 5
export const OTP_MAX_ATTEMPTS = 5
// At most this many codes per mobile per 15 minutes (abuse guard).
export const OTP_REQUEST_CAP = 5

export const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

// Codes are short-lived 6-digit values; a keyed sha256 is plenty and keeps the
// verify path cheap.
export const hashOtp = (mobile, code) =>
  crypto.createHash('sha256').update(`${mobile}:${code}:${SECRET}`).digest('hex')

// True when the API should echo the code back in the response so login can be
// tested before a real delivery channel exists. Never enable in production.
export const otpDevEcho = () =>
  process.env.OTP_DEV_ECHO === '1' || process.env.NODE_ENV !== 'production'

export async function sendOtp(mobile, code) {
  // TODO: WhatsApp template send (server/src/whatsapp.js on the marketing API
  // is the reference) or SMS gateway, once the channel is decided.
  console.log(`[otp] login code for ${mobile}: ${code}`)
  return { delivered: false }
}
