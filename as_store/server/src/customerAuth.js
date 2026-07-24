import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

export function normalizeMobile(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (!d.startsWith('961')) {
    if (d.startsWith('0')) d = d.slice(1)
    if (d.length >= 6 && d.length <= 8) d = `961${d}`
  }
  return d.length >= 9 && d.length <= 15 ? d : ''
}

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

export function requireCustomer(req, res, next) {
  const id = customerIdFromHeader(req)
  if (!id) return res.status(401).json({ error: 'Unauthorized' })
  req.customerId = id
  next()
}

export function optionalCustomer(req, _res, next) {
  req.customerId = customerIdFromHeader(req)
  next()
}
