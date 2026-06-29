import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

// Validate credentials against the single admin defined in .env.
export function login(email, password) {
  const okEmail = email && email === process.env.ADMIN_EMAIL
  const okPass = password && password === process.env.ADMIN_PASSWORD
  return okEmail && okPass ? signToken({ email }) : null
}

// Express middleware: require a valid admin Bearer token. Customer tokens share
// the same secret but carry kind:'customer' — reject those here so a logged-in
// shopper can never reach admin endpoints.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const payload = jwt.verify(token, SECRET)
    if (payload.kind === 'customer') return res.status(401).json({ error: 'Unauthorized' })
    req.admin = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Optional auth: attaches req.admin if a valid admin token is present, but never
// blocks. Customer tokens are ignored (treated as anonymous).
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (token) {
    try {
      const payload = jwt.verify(token, SECRET)
      if (payload.kind !== 'customer') req.admin = payload
    } catch {
      /* ignore — treat as anonymous */
    }
  }
  next()
}
