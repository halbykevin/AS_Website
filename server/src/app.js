import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { query } from './db.js'
import { login, requireAuth } from './auth.js'
import { scraperRouter } from './scraper.js'
import { whatsappEnabled, sendTemplate } from './whatsapp.js'
import { mailEnabled, sendPredictionEmail, sendContactEmail } from './mailer.js'
import { imageResizer } from './images.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'))
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, '')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

export const app = express()

// Behind nginx on the VPS — trust the first hop so req.ip is the real visitor
// address (used to throttle the public contact form) instead of 127.0.0.1.
app.set('trust proxy', 1)

// CORS — lock to the website origin(s) in production.
const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim())
app.use(cors({ origin: origins.includes('*') ? true : origins }))
app.use(express.json({ limit: '1mb' }))
// Resize/re-encode on the fly when ?w=/?format=/?q= are present, then fall
// through to the untouched originals. Cached variants live in UPLOAD_DIR/.cache.
app.use('/uploads', imageResizer(UPLOAD_DIR))
app.use('/uploads', express.static(UPLOAD_DIR))

// Wrap async handlers so thrown errors hit the error middleware.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const fmtDate = (d) => (d ? String(d).slice(0, 10) : '')

// ---- Response mappers (DB snake_case -> API camelCase) ----
const settingsJson = (r) => ({
  brandName: r.brand_name, legalName: r.legal_name, tagline: r.tagline, logoUrl: r.logo_url,
  logoSize: r.logo_size, logoSizeDesktop: r.logo_size_desktop,
  bannerHeight: r.banner_height == null ? 6 : Number(r.banner_height),
  faviconUrl: r.favicon_url,
  heroEyebrow: r.hero_eyebrow, heroTitle: r.hero_title, heroSubtitle: r.hero_subtitle,
  heroPrimaryLabel: r.hero_primary_label, heroSecondaryLabel: r.hero_secondary_label,
  servicesHeading: r.services_heading, servicesSubheading: r.services_subheading,
  eventsHeading: r.events_heading, eventsIntro: r.events_intro,
  aboutHeading: r.about_heading, aboutBody: r.about_body, aboutStats: r.about_stats,
  contactHeading: r.contact_heading, contactSubheading: r.contact_subheading,
  contactEmail: r.contact_email, contactWhatsapp: r.contact_whatsapp,
  whatsappNumber: r.whatsapp_number,
  contactInstagram: r.contact_instagram, contactInstagramHandle: r.contact_instagram_handle,
  storeTitle: r.store_title, storeEyebrow: r.store_eyebrow,
  storeDescription: r.store_description, storeUrl: r.store_url,
  ticketingUrl: r.ticketing_url || '',
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
  focalX: r.focal_x, focalY: r.focal_y,
})
const categoryJson = (r) => ({
  id: r.id, name: r.name, slug: r.slug, imageUrl: r.image_url, sort: r.sort, visible: r.visible,
  // Non-null = the events sync hid this one because it was empty. The admin
  // list shows it so a category that vanished on its own is explicable.
  autoHiddenAt: r.auto_hidden_at || null,
})
const sectionJson = (r) => ({
  id: r.id, eyebrow: r.eyebrow, heading: r.heading, body: r.body, imageUrl: r.image_url,
  buttonLabel: r.button_label, buttonUrl: r.button_url, theme: r.theme, sort: r.sort, visible: r.visible,
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
const storyJson = (r) => ({
  enabled: r.enabled, eyebrow: r.eyebrow, heading: r.heading,
  subheading: r.subheading, updatedAt: r.updated_at,
})
const storyPanelJson = (r) => ({
  id: r.id, heading: r.heading, caption: r.caption, imageUrl: r.image_url,
  accent: r.accent, accent2: r.accent2, gradientType: r.gradient_type,
  linkUrl: r.link_url, buttonEnabled: r.button_enabled, buttonLabel: r.button_label || 'Explore',
  size: r.size, fit: r.fit || 'cover', fontSize: r.font_size, sort: r.sort, visible: r.visible,
  focalX: r.focal_x, focalY: r.focal_y,
})
const whatWeDoJson = (r) => ({
  enabled: r.enabled, eyebrow: r.eyebrow, title: r.title,
  intro: Array.isArray(r.intro) ? r.intro : [],
  solutionsHeading: r.solutions_heading, solutionsIntro: r.solutions_intro,
  visionHeading: r.vision_heading, vision: r.vision,
  missionHeading: r.mission_heading, mission: r.mission,
  divisionsHeading: r.divisions_heading, divisionsIntro: r.divisions_intro,
  divisions: Array.isArray(r.divisions) ? r.divisions : [],
  updatedAt: r.updated_at,
})
const solutionJson = (r) => ({
  id: r.id, slug: r.slug, title: r.title, summary: r.summary, icon: r.icon,
  imageUrl: r.image_url, intro: r.intro, outro: r.outro,
  items: Array.isArray(r.items) ? r.items : [],
  sort: r.sort, visible: r.visible,
})
const predictorJson = (r) => ({
  enabled: r.enabled, notifyWhatsapp: r.notify_whatsapp,
  title: r.title, subtitle: r.subtitle, intro: r.intro,
  prizeEnabled: r.prize_enabled,
  prizeTitle: r.prize_title, prizeDescription: r.prize_description, prizeImageUrl: r.prize_image_url,
  entryFee: r.entry_fee == null ? 5 : Number(r.entry_fee),
  paymentEnabled: r.payment_enabled, paymentRecipient: r.payment_recipient,
  paymentNote: r.payment_note, paymentInstructions: r.payment_instructions,
  howToWin: Array.isArray(r.how_to_win) ? r.how_to_win : [],
  repostUrl: r.repost_url || '',
  shareUrl: r.share_url || '', shareMessage: r.share_message || '',
  prizeAmount: r.prize_amount || '',
  terms: Array.isArray(r.terms) ? r.terms : [],
  autoOpen: r.auto_open === true, triggerType: r.trigger_type || 'load',
  delaySeconds: r.delay_seconds == null ? 1 : Number(r.delay_seconds),
  scrollPercent: r.scroll_percent == null ? 40 : Number(r.scroll_percent),
  deadline: r.deadline, closed: r.closed, successMessage: r.success_message, updatedAt: r.updated_at,
})
const predictorMatchJson = (r) => ({
  id: r.id, stage: r.stage,
  teamA: r.team_a, teamACode: r.team_a_code, teamAFlag: r.team_a_flag,
  teamB: r.team_b, teamBCode: r.team_b_code, teamBFlag: r.team_b_flag,
  kickoff: r.kickoff, sort: r.sort, visible: r.visible,
})
const wheelEntryJson = (r) => ({
  id: r.id, drawNumber: r.draw_number || '', fullName: r.full_name,
  source: r.source || 'manual', predictionId: r.prediction_id,
  wins: Number(r.wins) || 0, wonAt: r.won_at, sort: r.sort || 0, createdAt: r.created_at,
})
const contactMessageJson = (r) => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone || '',
  subject: r.subject || '', message: r.message, read: r.read === true, createdAt: r.created_at,
})
const predictionJson = (r) => ({
  id: r.id, fullName: r.full_name, mobile: r.mobile,
  drawNumber: r.draw_number == null ? null : Number(r.draw_number),
  picks: Array.isArray(r.picks) ? r.picks : [], createdAt: r.created_at,
  sharePlatform: r.share_platform || '', shareItem: r.share_item || '',
  archived: r.archived === true, archivedAt: r.archived_at,
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
       published=$27, whatsapp_number=$28, favicon_url=$29, logo_size=$30,
       banner_height=$31, logo_size_desktop=$32, ticketing_url=$33, updated_at=now()
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
      Boolean(b.published), b.whatsappNumber || '', b.faviconUrl || '',
      Number(b.logoSize) || 48,
      b.bannerHeight == null || b.bannerHeight === '' ? 6 : Number(b.bannerHeight),
      Number(b.logoSizeDesktop) || 72,
      String(b.ticketingUrl || '').trim().replace(/\/+$/, ''),
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

// Clamp a focal-point percentage to 0–100 (default 50 = centred).
const clampPct = (v) => Math.min(100, Math.max(0, Math.round(Number(v))))
const focal = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? 50 : clampPct(v))

const bannerParams = (b) => [
  b.title || '', b.subtitle || '', b.imageUrl || '', b.linkUrl || '',
  Number(b.sort) || 0, b.active === undefined ? true : Boolean(b.active),
  b.eventId ? Number(b.eventId) : null, focal(b.focalX), focal(b.focalY),
]

app.post('/api/banners', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO banners (title, subtitle, image_url, link_url, sort, active, event_id, focal_x, focal_y)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    bannerParams(req.body || {})
  )
  res.status(201).json(bannerJson(rows[0]))
}))

app.put('/api/banners/:id', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `UPDATE banners SET title=$1, subtitle=$2, image_url=$3, link_url=$4, sort=$5, active=$6,
       event_id=$7, focal_x=$8, focal_y=$9
     WHERE id=$10 RETURNING *`,
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

// ========================= Story (horizontal scroll) =========================
// Public read; admin edits the singleton section row + manages the panels.
app.get('/api/story', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM story WHERE id = 1')
  res.json(rows[0] ? storyJson(rows[0]) : null)
}))

app.put('/api/story', requireAuth, ah(async (req, res) => {
  const b = req.body || {}
  const { rows } = await query(
    `UPDATE story SET enabled=$1, eyebrow=$2, heading=$3, subheading=$4, updated_at=now()
     WHERE id = 1 RETURNING *`,
    [b.enabled === undefined ? true : Boolean(b.enabled), b.eyebrow || '', b.heading || '', b.subheading || '']
  )
  res.json(storyJson(rows[0]))
}))

app.get('/api/story-panels', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM story_panels ORDER BY sort ASC, id ASC')
  res.json(rows.map(storyPanelJson))
}))

const storyPanelParams = (b) => [
  b.heading || '', b.caption || '', b.imageUrl || '', b.accent || '', b.accent2 || '',
  b.gradientType || 'linear', b.linkUrl || '', b.size || 'md', b.fontSize || 'md',
  Number(b.sort) || 0, b.visible === undefined ? true : Boolean(b.visible),
  b.buttonEnabled === undefined ? false : Boolean(b.buttonEnabled), b.buttonLabel || 'Explore',
  b.fit || 'cover', focal(b.focalX), focal(b.focalY),
]

app.post('/api/story-panels', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO story_panels (heading, caption, image_url, accent, accent2, gradient_type, link_url, size, font_size, sort, visible, button_enabled, button_label, fit, focal_x, focal_y)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    storyPanelParams(req.body || {})
  )
  res.status(201).json(storyPanelJson(rows[0]))
}))

app.put('/api/story-panels/:id', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `UPDATE story_panels SET heading=$1, caption=$2, image_url=$3, accent=$4, accent2=$5, gradient_type=$6, link_url=$7, size=$8, font_size=$9, sort=$10, visible=$11, button_enabled=$12, button_label=$13, fit=$14, focal_x=$15, focal_y=$16
     WHERE id=$17 RETURNING *`,
    [...storyPanelParams(req.body || {}), req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(storyPanelJson(rows[0]))
}))

app.delete('/api/story-panels/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM story_panels WHERE id=$1', [req.params.id])
  res.status(204).end()
}))

// ========================= What We Do (Absolute Solution) =========================
// Public read; admin edits the singleton page-copy row + manages the solutions.
app.get('/api/what-we-do', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM what_we_do WHERE id = 1')
  res.json(rows[0] ? whatWeDoJson(rows[0]) : null)
}))

app.put('/api/what-we-do', requireAuth, ah(async (req, res) => {
  const b = req.body || {}
  const { rows } = await query(
    `UPDATE what_we_do SET
       enabled=$1, eyebrow=$2, title=$3, intro=$4,
       solutions_heading=$5, solutions_intro=$6,
       vision_heading=$7, vision=$8, mission_heading=$9, mission=$10,
       divisions_heading=$11, divisions_intro=$12, divisions=$13, updated_at=now()
     WHERE id = 1 RETURNING *`,
    [
      b.enabled === undefined ? true : Boolean(b.enabled),
      b.eyebrow || '', b.title || '', JSON.stringify(Array.isArray(b.intro) ? b.intro : []),
      b.solutionsHeading || '', b.solutionsIntro || '',
      b.visionHeading || '', b.vision || '', b.missionHeading || '', b.mission || '',
      b.divisionsHeading || '', b.divisionsIntro || '', JSON.stringify(Array.isArray(b.divisions) ? b.divisions : []),
    ]
  )
  res.json(whatWeDoJson(rows[0]))
}))

app.get('/api/solutions', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM solutions ORDER BY sort ASC, id ASC')
  res.json(rows.map(solutionJson))
}))

app.get('/api/solutions/:slug', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM solutions WHERE slug=$1', [req.params.slug])
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(solutionJson(rows[0]))
}))

const cleanItems = (items) =>
  (Array.isArray(items) ? items : [])
    .map((it) => ({ title: String(it?.title || '').trim(), description: String(it?.description || '').trim() }))
    .filter((it) => it.title || it.description)

const solutionParams = (b) => [
  b.slug ? slugify(b.slug) : slugify(b.title || ''), b.title || '', b.summary || '',
  b.icon || 'chip', b.imageUrl || '', b.intro || '', b.outro || '',
  JSON.stringify(cleanItems(b.items)), Number(b.sort) || 0,
  b.visible === undefined ? true : Boolean(b.visible),
]

app.post('/api/solutions', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO solutions (slug, title, summary, icon, image_url, intro, outro, items, sort, visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    solutionParams(req.body || {})
  )
  res.status(201).json(solutionJson(rows[0]))
}))

app.put('/api/solutions/:id', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `UPDATE solutions SET slug=$1, title=$2, summary=$3, icon=$4, image_url=$5,
       intro=$6, outro=$7, items=$8, sort=$9, visible=$10
     WHERE id=$11 RETURNING *`,
    [...solutionParams(req.body || {}), req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(solutionJson(rows[0]))
}))

app.delete('/api/solutions/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM solutions WHERE id=$1', [req.params.id])
  res.status(204).end()
}))

// ========================= Predictor (World Cup 2026 game) =========================
// Public reads the config + matches; admin edits the singleton row, manages the
// matches, and reads the submitted predictions.
app.get('/api/predictor', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM predictor WHERE id = 1')
  res.json(rows[0] ? predictorJson(rows[0]) : null)
}))

app.put('/api/predictor', requireAuth, ah(async (req, res) => {
  const b = req.body || {}
  const { rows } = await query(
    `UPDATE predictor SET
       enabled=$1, title=$2, subtitle=$3, intro=$4,
       prize_title=$5, prize_description=$6, prize_image_url=$7,
       deadline=$8, closed=$9, success_message=$10, prize_enabled=$11, notify_whatsapp=$12,
       entry_fee=$13, payment_enabled=$14, payment_recipient=$15, payment_note=$16, payment_instructions=$17,
       how_to_win=$18::jsonb, repost_url=$19,
       auto_open=$20, trigger_type=$21, delay_seconds=$22, scroll_percent=$23,
       share_url=$24, share_message=$25, prize_amount=$26, terms=$27::jsonb,
       updated_at=now()
     WHERE id = 1 RETURNING *`,
    [
      Boolean(b.enabled), b.title || '', b.subtitle || '', b.intro || '',
      b.prizeTitle || '', b.prizeDescription || '', b.prizeImageUrl || '',
      b.deadline || null, Boolean(b.closed), b.successMessage || '',
      b.prizeEnabled === undefined ? true : Boolean(b.prizeEnabled),
      Boolean(b.notifyWhatsapp),
      b.entryFee == null || b.entryFee === '' ? 5 : Number(b.entryFee),
      b.paymentEnabled === undefined ? true : Boolean(b.paymentEnabled),
      b.paymentRecipient || 'AS Company', b.paymentNote || '', b.paymentInstructions || '',
      JSON.stringify((Array.isArray(b.howToWin) ? b.howToWin : []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 12)),
      b.repostUrl || '',
      Boolean(b.autoOpen), b.triggerType === 'scroll' ? 'scroll' : 'load',
      b.delaySeconds == null || b.delaySeconds === '' ? 1 : Number(b.delaySeconds),
      b.scrollPercent == null || b.scrollPercent === '' ? 40 : Number(b.scrollPercent),
      b.shareUrl || '', b.shareMessage || '', b.prizeAmount || '',
      JSON.stringify((Array.isArray(b.terms) ? b.terms : []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 12)),
    ]
  )
  res.json(predictorJson(rows[0]))
}))

app.get('/api/predictor-matches', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM predictor_matches ORDER BY sort ASC, kickoff ASC, id ASC')
  res.json(rows.map(predictorMatchJson))
}))

const matchParams = (b) => [
  b.stage || '',
  b.teamA || '', b.teamACode || '', b.teamAFlag || '',
  b.teamB || '', b.teamBCode || '', b.teamBFlag || '',
  b.kickoff || null, Number(b.sort) || 0,
  b.visible === undefined ? true : Boolean(b.visible),
]

app.post('/api/predictor-matches', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO predictor_matches (stage, team_a, team_a_code, team_a_flag, team_b, team_b_code, team_b_flag, kickoff, sort, visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    matchParams(req.body || {})
  )
  res.status(201).json(predictorMatchJson(rows[0]))
}))

app.put('/api/predictor-matches/:id', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `UPDATE predictor_matches SET stage=$1, team_a=$2, team_a_code=$3, team_a_flag=$4,
       team_b=$5, team_b_code=$6, team_b_flag=$7, kickoff=$8, sort=$9, visible=$10
     WHERE id=$11 RETURNING *`,
    [...matchParams(req.body || {}), req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(predictorMatchJson(rows[0]))
}))

app.delete('/api/predictor-matches/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM predictor_matches WHERE id=$1', [req.params.id])
  res.status(204).end()
}))

// Public submission. The game is a single pick — the exact final score of the
// featured match — validated against the visible matches.
// Normalise a phone number so the same number typed with/without spaces, dashes
// or parentheses counts as one entry (keeps a leading + and the digits).
const normalizeMobile = (s) => {
  const cleaned = String(s || '').replace(/[^\d+]/g, '')
  return cleaned.startsWith('+') ? '+' + cleaned.slice(1).replace(/\+/g, '') : cleaned.replace(/\+/g, '')
}

app.post('/api/predictions', ah(async (req, res) => {
  const b = req.body || {}
  const fullName = String(b.fullName || '').trim()
  const mobile = normalizeMobile(b.mobile)
  if (!fullName || !mobile) return res.status(400).json({ error: 'Full name and mobile number are required' })

  const cfg = (await query('SELECT enabled, closed, deadline, notify_whatsapp, title FROM predictor WHERE id = 1')).rows[0]
  if (!cfg || !cfg.enabled || cfg.closed) return res.status(403).json({ error: 'The game is not currently open' })
  if (cfg.deadline && new Date(cfg.deadline).getTime() < Date.now())
    return res.status(403).json({ error: 'The prediction deadline has passed' })

  // The match being played is one of the visible predictor_matches rows; the
  // player predicts its exact final score.
  const matchRows = (await query(
    'SELECT id, stage, team_a, team_b FROM predictor_matches WHERE visible = true ORDER BY sort ASC, kickoff ASC, id ASC'
  )).rows
  const pick = Array.isArray(b.picks) ? b.picks[0] : null
  const matchId = Number(b.matchId ?? pick?.matchId)
  const match = matchRows.find((m) => m.id === matchId) || (matchRows.length === 1 ? matchRows[0] : null)
  if (!match) return res.status(400).json({ error: 'Please choose the match you are predicting' })

  // The pick is a best-of-7 series result (NBA finals style): games won by each
  // team, so exactly one side must reach 4 and the other sits on 0–3.
  const SERIES_WINS = 4
  const asScore = (v) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 && n <= SERIES_WINS ? n : null
  }
  const scoreA = asScore(b.scoreA ?? pick?.scoreA)
  const scoreB = asScore(b.scoreB ?? pick?.scoreB)
  if (scoreA === null || scoreB === null)
    return res.status(400).json({ error: 'Please enter how many games each team wins (0–4)' })
  if (Math.max(scoreA, scoreB) !== SERIES_WINS || Math.min(scoreA, scoreB) >= SERIES_WINS)
    return res.status(400).json({ error: 'A best-of-7 series ends at 4 wins — one team must have exactly 4' })

  // Stored as a one-entry picks array so existing entry tooling keeps working.
  const picks = [{ matchId: match.id, teamA: match.team_a || '', teamB: match.team_b || '', scoreA, scoreB }]
  const scoreLine = `${match.team_a || 'Team A'} ${scoreA} — ${scoreB} ${match.team_b || 'Team B'}`
  const sharePlatform = ['instagram', 'facebook', 'whatsapp'].includes(String(b.sharePlatform || '').toLowerCase())
    ? String(b.sharePlatform).toLowerCase()
    : ''
  const shareItem = String(b.shareItem || '').trim().slice(0, 500)

  try {
    const { rows } = await query(
      'INSERT INTO predictions (full_name, mobile, picks, share_platform, share_item) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [fullName, mobile, JSON.stringify(picks), sharePlatform, shareItem]
    )
    res.status(201).json(predictionJson(rows[0]))

    // Fire-and-forget WhatsApp confirmation. Never blocks or fails the response;
    // a no-op unless the admin enabled it AND the Cloud API env vars are configured.
    if (cfg.notify_whatsapp && whatsappEnabled()) {
      sendTemplate(mobile, [fullName, scoreLine]).catch((err) =>
        console.error('[whatsapp] prediction confirmation failed:', err.message)
      )
    }

    // Fire-and-forget staff email notification. No-op unless SMTP is configured.
    if (mailEnabled()) {
      sendPredictionEmail({
        playerName: fullName,
        mobile,
        createdAt: rows[0].created_at,
        gameTitle: cfg.title || 'Guess the Score',
        pick: scoreLine,
        sharePlatform,
        drawNumber: rows[0].draw_number,
      }).catch((err) => console.error('[mail] prediction notification failed:', err.message))
    }
  } catch (err) {
    // Unique-violation on the mobile number → this phone already entered.
    if (err?.code === '23505')
      return res.status(409).json({ error: 'This mobile number has already submitted a prediction.' })
    throw err
  }
}))

app.get('/api/predictions', requireAuth, ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM predictions ORDER BY created_at DESC, id DESC')
  res.json(rows.map(predictionJson))
}))

// Archive / restore one entry. Archiving keeps it on record but frees the mobile
// number for a new entry; restoring fails if that number entered again meanwhile.
app.put('/api/predictions/:id/archive', requireAuth, ah(async (req, res) => {
  const archived = req.body?.archived !== false
  try {
    const { rows } = await query(
      'UPDATE predictions SET archived=$1, archived_at=CASE WHEN $1 THEN now() ELSE NULL END WHERE id=$2 RETURNING *',
      [archived, req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Entry not found' })
    res.json(predictionJson(rows[0]))
  } catch (err) {
    if (err?.code === '23505')
      return res.status(409).json({ error: 'This mobile number already has an active entry — the archived one cannot be restored.' })
    throw err
  }
}))

// Archive every active entry in one go (start a fresh round).
app.post('/api/predictions/archive-all', requireAuth, ah(async (req, res) => {
  const { rowCount } = await query('UPDATE predictions SET archived=true, archived_at=now() WHERE NOT archived')
  res.json({ archived: rowCount })
}))

// Delete a hand-picked set of entries (the admin's checkbox selection). Kept as
// POST so the id list travels in the body — DELETE bodies are unreliable.
app.post('/api/predictions/bulk-delete', requireAuth, ah(async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : [])
    .map((id) => Number(id))
    .filter(Number.isInteger)
  if (ids.length === 0) return res.status(400).json({ error: 'No entries selected.' })
  const { rowCount } = await query('DELETE FROM predictions WHERE id = ANY($1::int[])', [ids])
  res.json({ deleted: rowCount })
}))

app.delete('/api/predictions/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM predictions WHERE id=$1', [req.params.id])
  res.status(204).end()
}))

// ========================= Lucky-draw wheel =========================
// Admin-only end to end: the wheel is a tool staff run on stage, never a public
// page. Entries are typed/pasted in or imported from the active predictions.
const WHEEL_MAX_BULK = 2000
const drawNo = (v) => String(v ?? '').trim().slice(0, 40)
const entryName = (v) => String(v ?? '').trim().slice(0, 120)

app.get('/api/wheel-entries', requireAuth, ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM wheel_entries ORDER BY sort ASC, id ASC')
  res.json(rows.map(wheelEntryJson))
}))

app.post('/api/wheel-entries', requireAuth, ah(async (req, res) => {
  const b = req.body || {}
  const fullName = entryName(b.fullName)
  if (!fullName) return res.status(400).json({ error: 'A full name is required' })
  const { rows } = await query(
    `INSERT INTO wheel_entries (draw_number, full_name, source, sort)
     VALUES ($1,$2,'manual',$3) RETURNING *`,
    [drawNo(b.drawNumber), fullName, Number(b.sort) || 0]
  )
  res.status(201).json(wheelEntryJson(rows[0]))
}))

// Add a whole pasted list in one round trip (the "paste many names" box).
app.post('/api/wheel-entries/bulk', requireAuth, ah(async (req, res) => {
  const entries = (Array.isArray(req.body?.entries) ? req.body.entries : [])
    .map((e) => ({ drawNumber: drawNo(e?.drawNumber), fullName: entryName(e?.fullName) }))
    .filter((e) => e.fullName)
    .slice(0, WHEEL_MAX_BULK)
  if (entries.length === 0) return res.status(400).json({ error: 'No names found to add' })
  const { rows } = await query(
    `INSERT INTO wheel_entries (draw_number, full_name, source)
     SELECT d, n, 'manual' FROM UNNEST($1::text[], $2::text[]) AS t(d, n) RETURNING *`,
    [entries.map((e) => e.drawNumber), entries.map((e) => e.fullName)]
  )
  res.status(201).json({ added: rows.length, entries: rows.map(wheelEntryJson) })
}))

// Pull in every ACTIVE (non-archived) "Guess the Score" entry. Keyed on
// prediction_id so running it again refreshes names/draw numbers rather than
// duplicating the pool.
app.post('/api/wheel-entries/import-predictions', requireAuth, ah(async (req, res) => {
  const before = (await query('SELECT COUNT(*)::int AS n FROM wheel_entries')).rows[0].n
  const { rows } = await query(
    `INSERT INTO wheel_entries (draw_number, full_name, source, prediction_id)
     SELECT s.draw_number, s.full_name, 'predictor', s.id
       FROM (SELECT COALESCE(p.draw_number::text, '') AS draw_number, p.full_name, p.id
               FROM predictions p
              WHERE NOT p.archived
              ORDER BY p.draw_number ASC, p.id ASC) s
     ON CONFLICT (prediction_id) WHERE prediction_id IS NOT NULL
     DO UPDATE SET draw_number = EXCLUDED.draw_number, full_name = EXCLUDED.full_name
     RETURNING *`
  )
  const after = (await query('SELECT COUNT(*)::int AS n FROM wheel_entries')).rows[0].n
  const created = after - before
  res.json({ imported: rows.length, created, updated: rows.length - created })
}))

app.put('/api/wheel-entries/:id', requireAuth, ah(async (req, res) => {
  const b = req.body || {}
  const fullName = entryName(b.fullName)
  if (!fullName) return res.status(400).json({ error: 'A full name is required' })
  const { rows } = await query(
    'UPDATE wheel_entries SET draw_number=$1, full_name=$2, sort=$3 WHERE id=$4 RETURNING *',
    [drawNo(b.drawNumber), fullName, Number(b.sort) || 0, req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Entry not found' })
  res.json(wheelEntryJson(rows[0]))
}))

// Record the spin result, so the draw stays on the record after the reveal.
app.post('/api/wheel-entries/:id/win', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    'UPDATE wheel_entries SET wins = wins + 1, won_at = now() WHERE id=$1 RETURNING *',
    [req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Entry not found' })
  res.json(wheelEntryJson(rows[0]))
}))

// Clear every winner mark — start a fresh round without retyping the pool.
app.post('/api/wheel-entries/reset-wins', requireAuth, ah(async (req, res) => {
  const { rowCount } = await query('UPDATE wheel_entries SET wins = 0, won_at = NULL WHERE wins > 0')
  res.json({ reset: rowCount })
}))

// Delete a ticked selection (POST so the id list travels in the body).
app.post('/api/wheel-entries/bulk-delete', requireAuth, ah(async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger)
  if (ids.length === 0) return res.status(400).json({ error: 'No entries selected.' })
  const { rowCount } = await query('DELETE FROM wheel_entries WHERE id = ANY($1::int[])', [ids])
  res.json({ deleted: rowCount })
}))

app.delete('/api/wheel-entries', requireAuth, ah(async (req, res) => {
  const { rowCount } = await query('DELETE FROM wheel_entries')
  res.json({ deleted: rowCount })
}))

app.delete('/api/wheel-entries/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM wheel_entries WHERE id=$1', [req.params.id])
  res.status(204).end()
}))

// ========================= Contact messages =========================
// Public "Get in touch" form on /contact. Every message is stored (so nothing is
// lost if mail is down) and emailed to the staff inbox.

// Light in-memory throttle: max 5 submissions per IP per 10 minutes, so a bot
// can't flood the inbox. Resets on restart — that's fine for this scale.
const contactHits = new Map()
const CONTACT_WINDOW_MS = 10 * 60 * 1000
const CONTACT_MAX = 5
function contactThrottled(ip) {
  const now = Date.now()
  const hits = (contactHits.get(ip) || []).filter((t) => now - t < CONTACT_WINDOW_MS)
  if (hits.length >= CONTACT_MAX) {
    contactHits.set(ip, hits)
    return true
  }
  hits.push(now)
  contactHits.set(ip, hits)
  // Drop stale IPs so the map can't grow without bound.
  if (contactHits.size > 500) {
    for (const [key, times] of contactHits)
      if (!times.some((t) => now - t < CONTACT_WINDOW_MS)) contactHits.delete(key)
  }
  return false
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

app.post('/api/contact', ah(async (req, res) => {
  const b = req.body || {}
  // Honeypot — a hidden field real visitors never fill in. Accept and drop.
  if (String(b.website || '').trim()) return res.status(201).json({ ok: true })

  const name = String(b.name || '').trim().slice(0, 120)
  const email = String(b.email || '').trim().slice(0, 200)
  const phone = String(b.phone || '').trim().slice(0, 40)
  const subject = String(b.subject || '').trim().slice(0, 160)
  const message = String(b.message || '').trim().slice(0, 4000)

  if (!name || !email || !message)
    return res.status(400).json({ error: 'Name, email and message are required' })
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' })
  if (message.length < 5) return res.status(400).json({ error: 'Please write a little more in your message' })
  if (contactThrottled(req.ip))
    return res.status(429).json({ error: 'Too many messages just now — please try again in a few minutes.' })

  const { rows } = await query(
    'INSERT INTO contact_messages (name, email, phone, subject, message) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [name, email, phone, subject, message]
  )
  res.status(201).json({ ok: true, id: rows[0].id })

  // Fire-and-forget staff notification. No-op unless SMTP is configured; the
  // message is already saved, so a mail failure never loses it.
  if (mailEnabled()) {
    sendContactEmail({ name, email, phone, subject, message, createdAt: rows[0].created_at })
      .catch((err) => console.error('[mail] contact notification failed:', err.message))
  }
}))

app.get('/api/contact-messages', requireAuth, ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM contact_messages ORDER BY created_at DESC, id DESC')
  res.json(rows.map(contactMessageJson))
}))

app.put('/api/contact-messages/:id/read', requireAuth, ah(async (req, res) => {
  const read = req.body?.read !== false
  const { rows } = await query('UPDATE contact_messages SET read=$1 WHERE id=$2 RETURNING *', [read, req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Message not found' })
  res.json(contactMessageJson(rows[0]))
}))

app.delete('/api/contact-messages/:id', requireAuth, ah(async (req, res) => {
  await query('DELETE FROM contact_messages WHERE id=$1', [req.params.id])
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
