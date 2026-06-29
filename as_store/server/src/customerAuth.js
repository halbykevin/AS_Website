// Storefront customer auth: scrypt password hashing (no extra deps) + JWTs that
// carry kind:'customer' so they're distinct from admin tokens (see auth.js).
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split('$')
    if (scheme !== 'scrypt' || !salt || !hash) return false
    const candidate = crypto.scryptSync(String(password), salt, 64)
    const known = Buffer.from(hash, 'hex')
    return candidate.length === known.length && crypto.timingSafeEqual(candidate, known)
  } catch {
    return false
  }
}

export function signCustomerToken(customer) {
  return jwt.sign({ sub: customer.id, kind: 'customer', email: customer.email }, SECRET, {
    expiresIn: '30d',
  })
}

// Express middleware: require a valid customer Bearer token. Sets req.customerId.
export function requireCustomer(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const payload = jwt.verify(token, SECRET)
    if (payload.kind !== 'customer') return res.status(401).json({ error: 'Unauthorized' })
    req.customerId = payload.sub
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
