import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

// Validate credentials against the single admin defined in .env.
// Returns a signed token on success, or null.
export function login(email, password) {
  const okEmail = email && email === process.env.ADMIN_EMAIL
  const okPass = password && password === process.env.ADMIN_PASSWORD
  return okEmail && okPass ? signToken({ email }) : null
}

// Express middleware: require a valid Bearer token.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.admin = jwt.verify(token, SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
