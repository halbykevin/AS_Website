import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { query } from './db.js'
import { login, requireAuth } from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'))
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, '')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

export const app = express()

// CORS — lock to the website origin(s) in production.
const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim())
app.use(cors({ origin: origins.includes('*') ? true : origins }))
app.use(express.json({ limit: '1mb' }))
app.use('/uploads', express.static(UPLOAD_DIR))

// Wrap async handlers so thrown errors hit the error middleware.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const fmtDate = (d) => (d ? String(d).slice(0, 10) : '')

// ---- Response mappers (DB snake_case -> API camelCase) ----
const settingsJson = (r) => ({
  brandName: r.brand_name, legalName: r.legal_name, tagline: r.tagline, logoUrl: r.logo_url,
  heroEyebrow: r.hero_eyebrow, heroTitle: r.hero_title, heroSubtitle: r.hero_subtitle,
  aboutHeading: r.about_heading, aboutBody: r.about_body, aboutStats: r.about_stats,
  contactEmail: r.contact_email, contactWhatsapp: r.contact_whatsapp,
  contactInstagram: r.contact_instagram, contactInstagramHandle: r.contact_instagram_handle,
  storeTitle: r.store_title, storeEyebrow: r.store_eyebrow,
  storeDescription: r.store_description, storeUrl: r.store_url,
  published: r.published,
})
const serviceJson = (r) => ({ id: r.id, title: r.title, description: r.description, icon: r.icon, sort: r.sort })
const eventJson = (r) => ({
  id: r.id, title: r.title, slug: r.slug, category: r.category, date: fmtDate(r.date),
  time: r.time, venue: r.venue, city: r.city, imageUrl: r.image_url, price: r.price,
  status: r.status, excerpt: r.excerpt, description: r.description, sort: r.sort,
})
const reservationJson = (r) => ({
  id: r.id, eventId: r.event_id, eventTitle: r.event_title, name: r.name, email: r.email,
  phone: r.phone, quantity: r.quantity, status: r.status, created: r.created_at,
})

// ========================= Health =========================
app.get('/api/health', (req, res) => res.json({ ok: true }))

// ========================= Auth =========================
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {}
  const token = login(email || '', password || '')
  if (!token) return res.status(401).json({ error: 'Invalid email or password' })
  res.json({ token, admin: { email } })
})
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ email: req.admin.email }))

// ========================= Settings =========================
app.get('/api/settings', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM settings WHERE id = 1')
  res.json(rows[0] ? settingsJson(rows[0]) : null)
}))

app.put('/api/settings', requireAuth, ah(async (req, res) => {
  const b = req.body || {}
  const { rows } = await query(
    `UPDATE settings SET
       brand_name=$1, legal_name=$2, tagline=$3, logo_url=$4,
       hero_eyebrow=$5, hero_title=$6, hero_subtitle=$7,
       about_heading=$8, about_body=$9, about_stats=$10,
       contact_email=$11, contact_whatsapp=$12, contact_instagram=$13, contact_instagram_handle=$14,
       store_title=$15, store_eyebrow=$16, store_description=$17, store_url=$18,
       published=$19, updated_at=now()
     WHERE id = 1 RETURNING *`,
    [
      b.brandName || '', b.legalName || '', b.tagline || '', b.logoUrl || '',
      b.heroEyebrow || '', b.heroTitle || '', b.heroSubtitle || '',
      b.aboutHeading || '', JSON.stringify(b.aboutBody || []), JSON.stringify(b.aboutStats || []),
      b.contactEmail || '', b.contactWhatsapp || '', b.contactInstagram || '', b.contactInstagramHandle || '',
      b.storeTitle || '', b.storeEyebrow || '', b.storeDescription || '', b.storeUrl || '',
      Boolean(b.published),
    ]
  )
  res.json(settingsJson(rows[0]))
}))

// ========================= Services =========================
app.get('/api/services', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM services ORDER BY sort ASC, id ASC')
  res.json(rows.map(serviceJson))
}))

app.post('/api/services', requireAuth, ah(async (req, res) => {
  const b = req.body || {}
  const { rows } = await query(
    'INSERT INTO services (title, description, icon, sort) VALUES ($1,$2,$3,$4) RETURNING *',
    [b.title || '', b.description || '', b.icon || 'chip', Number(b.sort) || 0]
  )
  res.status(201).json(serviceJson(rows[0]))
}))

app.put('/api/services/:id', requireAuth, ah(async (req, res) => {
  const b = req.body || {}
  const { rows } = await query(
    'UPDATE services SET title=$1, description=$2, icon=$3, sort=$4 WHERE id=$5 RETURNING *',
    [b.title || '', b.description || '', b.icon || 'chip', Number(b.sort) || 0, req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(serviceJson(rows[0]))
}))

app.delete('/api/services/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM services WHERE id=$1', [req.params.id])
  res.status(204).end()
}))

// ========================= Events =========================
app.get('/api/events', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM events ORDER BY sort ASC, date ASC, id ASC')
  res.json(rows.map(eventJson))
}))

app.get('/api/events/:slug', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM events WHERE slug=$1', [req.params.slug])
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(eventJson(rows[0]))
}))

const eventParams = (b) => [
  b.title || '', b.slug ? slugify(b.slug) : slugify(b.title || ''), b.category || '',
  b.date || null, b.time || '', b.venue || '', b.city || '', b.imageUrl || '',
  b.price || '', b.status || 'open', b.excerpt || '', b.description || '', Number(b.sort) || 0,
]

app.post('/api/events', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO events (title, slug, category, date, time, venue, city, image_url, price, status, excerpt, description, sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    eventParams(req.body || {})
  )
  res.status(201).json(eventJson(rows[0]))
}))

app.put('/api/events/:id', requireAuth, ah(async (req, res) => {
  const p = eventParams(req.body || {})
  const { rows } = await query(
    `UPDATE events SET title=$1, slug=$2, category=$3, date=$4, time=$5, venue=$6, city=$7,
       image_url=$8, price=$9, status=$10, excerpt=$11, description=$12, sort=$13
     WHERE id=$14 RETURNING *`,
    [...p, req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(eventJson(rows[0]))
}))

app.delete('/api/events/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM events WHERE id=$1', [req.params.id])
  res.status(204).end()
}))

// ========================= Reservations =========================
// Public: submit a reservation.
app.post('/api/reservations', ah(async (req, res) => {
  const b = req.body || {}
  if (!b.eventId || !b.name || !b.email) return res.status(400).json({ error: 'Missing required fields' })
  const ev = await query('SELECT id FROM events WHERE id=$1', [b.eventId])
  if (!ev.rows[0]) return res.status(400).json({ error: 'Unknown event' })
  const { rows } = await query(
    `INSERT INTO reservations (event_id, name, email, phone, quantity, status)
     VALUES ($1,$2,$3,$4,$5,'new') RETURNING *`,
    [b.eventId, b.name, b.email, b.phone || '', Number(b.quantity) || 1]
  )
  res.status(201).json(reservationJson(rows[0]))
}))

// Admin: list / update status / delete.
app.get('/api/reservations', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `SELECT r.*, e.title AS event_title
       FROM reservations r LEFT JOIN events e ON e.id = r.event_id
      ORDER BY r.created_at DESC`
  )
  res.json(rows.map(reservationJson))
}))

app.patch('/api/reservations/:id', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    'UPDATE reservations SET status=$1 WHERE id=$2 RETURNING *',
    [req.body?.status || 'new', req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(reservationJson(rows[0]))
}))

app.delete('/api/reservations/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM reservations WHERE id=$1', [req.params.id])
  res.status(204).end()
}))

// ========================= Uploads =========================
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
})

app.post('/api/uploads', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' })
  res.status(201).json({ url: `${PUBLIC_URL}/uploads/${req.file.filename}` })
})

// ========================= Errors =========================
app.use((err, req, res, next) => {
  if (err?.code === '23505') return res.status(409).json({ error: 'That slug is already in use' })
  console.error(err)
  res.status(500).json({ error: 'Server error' })
})
