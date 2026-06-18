import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { query } from './db.js'
import { login, requireAuth } from './auth.js'
import { scraperRouter } from './scraper.js'

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
  heroPrimaryLabel: r.hero_primary_label, heroSecondaryLabel: r.hero_secondary_label,
  servicesHeading: r.services_heading, servicesSubheading: r.services_subheading,
  eventsHeading: r.events_heading, eventsIntro: r.events_intro,
  aboutHeading: r.about_heading, aboutBody: r.about_body, aboutStats: r.about_stats,
  contactHeading: r.contact_heading, contactSubheading: r.contact_subheading,
  contactEmail: r.contact_email, contactWhatsapp: r.contact_whatsapp,
  contactInstagram: r.contact_instagram, contactInstagramHandle: r.contact_instagram_handle,
  storeTitle: r.store_title, storeEyebrow: r.store_eyebrow,
  storeDescription: r.store_description, storeUrl: r.store_url,
  published: r.published,
})
const serviceJson = (r) => ({ id: r.id, title: r.title, description: r.description, icon: r.icon, sort: r.sort })
const eventJson = (r) => ({
  id: r.id, title: r.title, slug: r.slug, date: fmtDate(r.date),
  time: r.time, venue: r.venue, city: r.city, imageUrl: r.image_url, ticketUrl: r.ticket_url,
  status: r.status, excerpt: r.excerpt, description: r.description, sort: r.sort,
  categoryId: r.category_id, categorySlug: r.category_slug || '', categoryName: r.category_name || '',
  dates: Array.isArray(r.dates) ? r.dates : [],
})
const bannerJson = (r) => ({
  id: r.id, title: r.title, subtitle: r.subtitle, imageUrl: r.image_url,
  linkUrl: r.link_url, sort: r.sort, active: r.active, eventId: r.event_id,
})
const categoryJson = (r) => ({
  id: r.id, name: r.name, slug: r.slug, imageUrl: r.image_url, sort: r.sort, visible: r.visible,
})
const sectionJson = (r) => ({
  id: r.id, eyebrow: r.eyebrow, heading: r.heading, body: r.body, imageUrl: r.image_url,
  buttonLabel: r.button_label, buttonUrl: r.button_url, theme: r.theme, sort: r.sort, visible: r.visible,
})
const reservationJson = (r) => ({
  id: r.id, eventId: r.event_id, eventTitle: r.event_title, name: r.name, email: r.email,
  phone: r.phone, quantity: r.quantity, status: r.status, created: r.created_at,
})
const popupJson = (r) => ({
  enabled: r.enabled, title: r.title, body: r.body, imageUrl: r.image_url,
  linkUrl: r.link_url, linkLabel: r.link_label, trigger: r.trigger_type,
  delaySeconds: r.delay_seconds, scrollPercent: r.scroll_percent, updatedAt: r.updated_at,
})
const storeShowcaseJson = (r) => ({
  enabled: r.enabled, eyebrow: r.eyebrow, heading: r.heading,
  subheading: r.subheading, visibleCount: r.visible_count, updatedAt: r.updated_at,
})
const storeProductJson = (r) => ({
  id: r.id, name: r.name, imageUrl: r.image_url, linkUrl: r.link_url,
  sort: r.sort, visible: r.visible,
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
       hero_primary_label=$8, hero_secondary_label=$9,
       services_heading=$10, services_subheading=$11,
       events_heading=$12, events_intro=$13,
       about_heading=$14, about_body=$15, about_stats=$16,
       contact_heading=$17, contact_subheading=$18,
       contact_email=$19, contact_whatsapp=$20, contact_instagram=$21, contact_instagram_handle=$22,
       store_title=$23, store_eyebrow=$24, store_description=$25, store_url=$26,
       published=$27, updated_at=now()
     WHERE id = 1 RETURNING *`,
    [
      b.brandName || '', b.legalName || '', b.tagline || '', b.logoUrl || '',
      b.heroEyebrow || '', b.heroTitle || '', b.heroSubtitle || '',
      b.heroPrimaryLabel || '', b.heroSecondaryLabel || '',
      b.servicesHeading || '', b.servicesSubheading || '',
      b.eventsHeading || '', b.eventsIntro || '',
      b.aboutHeading || '', JSON.stringify(b.aboutBody || []), JSON.stringify(b.aboutStats || []),
      b.contactHeading || '', b.contactSubheading || '',
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
// Join the category so the public list/detail carry its slug + name.
const EVENTS_SELECT = `SELECT e.*, c.slug AS category_slug, c.name AS category_name
  FROM events e LEFT JOIN categories c ON c.id = e.category_id`

app.get('/api/events', ah(async (req, res) => {
  const { rows } = await query(`${EVENTS_SELECT} ORDER BY e.sort ASC, e.date ASC, e.id ASC`)
  res.json(rows.map(eventJson))
}))

app.get('/api/events/:slug', ah(async (req, res) => {
  const { rows } = await query(`${EVENTS_SELECT} WHERE e.slug=$1`, [req.params.slug])
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(eventJson(rows[0]))
}))

const eventParams = (b) => [
  b.title || '', b.slug ? slugify(b.slug) : slugify(b.title || ''),
  b.date || null, b.time || '', b.venue || '', b.city || '', b.imageUrl || '',
  b.ticketUrl || '', b.status || 'open', b.excerpt || '', b.description || '', Number(b.sort) || 0,
  b.categoryId ? Number(b.categoryId) : null,
]

app.post('/api/events', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO events (title, slug, date, time, venue, city, image_url, ticket_url, status, excerpt, description, sort, category_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    eventParams(req.body || {})
  )
  res.status(201).json(eventJson(rows[0]))
}))

app.put('/api/events/:id', requireAuth, ah(async (req, res) => {
  const p = eventParams(req.body || {})
  const { rows } = await query(
    `UPDATE events SET title=$1, slug=$2, date=$3, time=$4, venue=$5, city=$6,
       image_url=$7, ticket_url=$8, status=$9, excerpt=$10, description=$11, sort=$12, category_id=$13
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

// ========================= Banners =========================
// Public read (the frontend filters on `active`); admin manages all.
app.get('/api/banners', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM banners ORDER BY sort ASC, id ASC')
  res.json(rows.map(bannerJson))
}))

const bannerParams = (b) => [
  b.title || '', b.subtitle || '', b.imageUrl || '', b.linkUrl || '',
  Number(b.sort) || 0, b.active === undefined ? true : Boolean(b.active),
  b.eventId ? Number(b.eventId) : null,
]

app.post('/api/banners', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO banners (title, subtitle, image_url, link_url, sort, active, event_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    bannerParams(req.body || {})
  )
  res.status(201).json(bannerJson(rows[0]))
}))

app.put('/api/banners/:id', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `UPDATE banners SET title=$1, subtitle=$2, image_url=$3, link_url=$4, sort=$5, active=$6, event_id=$7
     WHERE id=$8 RETURNING *`,
    [...bannerParams(req.body || {}), req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(bannerJson(rows[0]))
}))

app.delete('/api/banners/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM banners WHERE id=$1', [req.params.id])
  res.status(204).end()
}))

// ========================= Custom sections =========================
// Public read (the frontend filters on `visible`); admin manages all.
app.get('/api/sections', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM sections ORDER BY sort ASC, id ASC')
  res.json(rows.map(sectionJson))
}))

const sectionParams = (b) => [
  b.eyebrow || '', b.heading || '', b.body || '', b.imageUrl || '',
  b.buttonLabel || '', b.buttonUrl || '', b.theme === 'dark' ? 'dark' : 'light',
  Number(b.sort) || 0, b.visible === undefined ? true : Boolean(b.visible),
]

app.post('/api/sections', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO sections (eyebrow, heading, body, image_url, button_label, button_url, theme, sort, visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    sectionParams(req.body || {})
  )
  res.status(201).json(sectionJson(rows[0]))
}))

app.put('/api/sections/:id', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `UPDATE sections SET eyebrow=$1, heading=$2, body=$3, image_url=$4,
       button_label=$5, button_url=$6, theme=$7, sort=$8, visible=$9
     WHERE id=$10 RETURNING *`,
    [...sectionParams(req.body || {}), req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(sectionJson(rows[0]))
}))

app.delete('/api/sections/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM sections WHERE id=$1', [req.params.id])
  res.status(204).end()
}))

// ========================= Categories =========================
// Public read (the frontend filters on `visible`); admin manages all.
app.get('/api/categories', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM categories ORDER BY sort ASC, id ASC')
  res.json(rows.map(categoryJson))
}))

const categoryParams = (b) => [
  b.name || '', b.slug ? slugify(b.slug) : slugify(b.name || ''),
  b.imageUrl || '', Number(b.sort) || 0, b.visible === undefined ? true : Boolean(b.visible),
]

app.post('/api/categories', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO categories (name, slug, image_url, sort, visible)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    categoryParams(req.body || {})
  )
  res.status(201).json(categoryJson(rows[0]))
}))

app.put('/api/categories/:id', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `UPDATE categories SET name=$1, slug=$2, image_url=$3, sort=$4, visible=$5
     WHERE id=$6 RETURNING *`,
    [...categoryParams(req.body || {}), req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(categoryJson(rows[0]))
}))

app.delete('/api/categories/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM categories WHERE id=$1', [req.params.id])
  res.status(204).end()
}))

// ========================= Popup =========================
// Public read (the frontend decides whether/when to show); admin edits the single row.
app.get('/api/popup', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM popup WHERE id = 1')
  res.json(rows[0] ? popupJson(rows[0]) : null)
}))

app.put('/api/popup', requireAuth, ah(async (req, res) => {
  const b = req.body || {}
  const trigger = b.trigger === 'scroll' ? 'scroll' : 'load'
  const { rows } = await query(
    `UPDATE popup SET
       enabled=$1, title=$2, body=$3, image_url=$4, link_url=$5, link_label=$6,
       trigger_type=$7, delay_seconds=$8, scroll_percent=$9, updated_at=now()
     WHERE id = 1 RETURNING *`,
    [
      Boolean(b.enabled), b.title || '', b.body || '', b.imageUrl || '',
      b.linkUrl || '', b.linkLabel || '', trigger,
      Math.max(0, Number(b.delaySeconds) || 0), Math.min(100, Math.max(0, Number(b.scrollPercent) || 0)),
    ]
  )
  res.json(popupJson(rows[0]))
}))

// ========================= AS Store showcase =========================
// Public read; admin edits the singleton section row + manages the products.
app.get('/api/store-showcase', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM store_showcase WHERE id = 1')
  res.json(rows[0] ? storeShowcaseJson(rows[0]) : null)
}))

app.put('/api/store-showcase', requireAuth, ah(async (req, res) => {
  const b = req.body || {}
  const { rows } = await query(
    `UPDATE store_showcase SET
       enabled=$1, eyebrow=$2, heading=$3, subheading=$4, visible_count=$5, updated_at=now()
     WHERE id = 1 RETURNING *`,
    [
      b.enabled === undefined ? true : Boolean(b.enabled),
      b.eyebrow || '', b.heading || '', b.subheading || '',
      Math.max(1, Number(b.visibleCount) || 8),
    ]
  )
  res.json(storeShowcaseJson(rows[0]))
}))

app.get('/api/store-products', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM store_products ORDER BY sort ASC, id ASC')
  res.json(rows.map(storeProductJson))
}))

const storeProductParams = (b) => [
  b.name || '', b.imageUrl || '', b.linkUrl || '',
  Number(b.sort) || 0, b.visible === undefined ? true : Boolean(b.visible),
]

app.post('/api/store-products', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO store_products (name, image_url, link_url, sort, visible)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    storeProductParams(req.body || {})
  )
  res.status(201).json(storeProductJson(rows[0]))
}))

app.put('/api/store-products/:id', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `UPDATE store_products SET name=$1, image_url=$2, link_url=$3, sort=$4, visible=$5
     WHERE id=$6 RETURNING *`,
    [...storeProductParams(req.body || {}), req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(storeProductJson(rows[0]))
}))

app.delete('/api/store-products/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM store_products WHERE id=$1', [req.params.id])
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

// ========================= Web scraper =========================
// Admin-only: run the Python e-commerce scraper and download its output.
app.use('/api/scrape', scraperRouter)

// ========================= Errors =========================
app.use((err, req, res, next) => {
  if (err?.code === '23505') return res.status(409).json({ error: 'That slug is already in use' })
  console.error(err)
  res.status(500).json({ error: 'Server error' })
})
