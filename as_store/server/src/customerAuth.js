// Storefront customer auth. Identity is the mobile number (OTP login) — JWTs
// carry kind:'customer' so they're distinct from admin tokens (see auth.js).
// A second token kind, 'order', grants read access to one order (used for the
// confirmation page right after a guest checkout).
import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

// Normalize a mobile number to plain digits with the country code, assuming
// Lebanon (+961) for local forms: "03 123 456" / "70123456" / "+961 70 123 456"
// all become "9613123456" / "96170123456". Returns '' when clearly invalid.
export function normalizeMobile(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (!d.startsWith('961')) {
    if (d.startsWith('0')) d = d.slice(1)
    if (d.length >= 6 && d.length <= 8) d = `961${d}`
  }
  return d.length >= 9 && d.length <= 15 ? d : ''
}

// Normalize + validate an email for OTP login. Returns '' when invalid.
export function normalizeEmail(raw) {
  const e = String(raw || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''
}

export function signCustomerToken(customer) {
  return jwt.sign({ sub: customer.id, kind: 'customer', mobile: customer.mobile || '' }, SECRET, {
    expiresIn: '30d',
  })
}

export function signOrderToken(orderId) {
  return jwt.sign({ sub: orderId, kind: 'order' }, SECRET, { expiresIn: '30d' })
}

// Returns the order id the token grants access to, or null.
export function verifyOrderToken(token) {
  try {
    const payload = jwt.verify(String(token || ''), SECRET)
    return payload.kind === 'order' ? payload.sub : null
  } catch {
    return null
  }
}

const customerIdFromHeader = (req) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  try {
    const payload = jwt.verify(token, SECRET)
    return payload.kind === 'customer' ? payload.sub : null
  } catch {
    return null
  }
}

// Express middleware: require a valid customer Bearer token. Sets req.customerId.
export function requireCustomer(req, res, next) {
  const id = customerIdFromHeader(req)
  if (!id) return res.status(401).json({ error: 'Unauthorized' })
  req.customerId = id
  next()
}

// Express middleware: set req.customerId when a valid customer token is present,
// but let the request through either way (guest checkout).
export function optionalCustomer(req, _res, next) {
  req.customerId = customerIdFromHeader(req)
  next()
}
