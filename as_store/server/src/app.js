import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { query } from './db.js'
import { login, requireAuth, optionalAuth } from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'))
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8081').replace(/\/$/, '')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

export const app = express()

// CORS — lock to the storefront/admin origins in production.
const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim())
app.use(cors({ origin: origins.includes('*') ? true : origins }))
app.use(express.json({ limit: '2mb' }))
app.use('/uploads', express.static(UPLOAD_DIR))

// Wrap async handlers so thrown errors hit the error middleware.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

// ---- Response mappers (DB snake_case -> API camelCase) ----
const categoryJson = (r) => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  tagline: r.tagline || '',
  imageUrl: r.image_url || '',
  sort: r.sort,
  visible: r.visible,
})

const productJson = (r) => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  tagline: r.tagline || '',
  description: r.description || '',
  price: r.price,
  oldPrice: r.old_price,
  categoryId: r.category_id,
  category: r.category_name || '',
  categorySlug: r.category_slug || '',
  colors: Array.isArray(r.colors) ? r.colors : [],
  stock: r.stock,
  isNew: r.is_new,
  featured: r.featured,
  visible: r.visible,
  sort: r.sort,
  image: r.image || (Array.isArray(r.images) ? r.images[0] : '') || '',
  images: Array.isArray(r.images) ? r.images : [],
})

// Shared SELECT fragments.
const LIST_SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug,
    (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id
       ORDER BY pi.sort, pi.id LIMIT 1) AS image
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id`

const DETAIL_SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug,
    COALESCE((SELECT json_agg(pi.url ORDER BY pi.sort, pi.id)
              FROM product_images pi WHERE pi.product_id = p.id), '[]') AS images
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id`

// Columns that admin create/update accept, mapped from camelCase body keys.
const PRODUCT_COLS = {
  name: 'name',
  slug: 'slug',
  tagline: 'tagline',
  description: 'description',
  price: 'price',
  oldPrice: 'old_price',
  categoryId: 'category_id',
  colors: 'colors',
  stock: 'stock',
  isNew: 'is_new',
  featured: 'featured',
  visible: 'visible',
  sort: 'sort',
}

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

// ========================= Categories =========================
// Public: visible categories. Authed: pass ?all=1 to include hidden.
app.get(
  '/api/categories',
  optionalAuth,
  ah(async (req, res) => {
    const all = req.admin && req.query.all === '1'
    const { rows } = await query(
      `SELECT * FROM categories ${all ? '' : 'WHERE visible = true'} ORDER BY sort, id`,
    )
    res.json(rows.map(categoryJson))
  }),
)

app.post(
  '/api/categories',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const name = (b.name || '').trim()
    if (!name) return res.status(400).json({ error: 'name is required' })
    const slug = (b.slug || '').trim() || slugify(name)
    const { rows } = await query(
      `INSERT INTO categories (name, slug, tagline, image_url, sort, visible)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, slug, b.tagline || '', b.imageUrl || '', b.sort ?? 0, b.visible ?? true],
    )
    res.status(201).json(categoryJson(rows[0]))
  }),
)

app.put(
  '/api/categories/:id',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const { rows } = await query(
      `UPDATE categories SET
         name      = COALESCE($2, name),
         slug      = COALESCE($3, slug),
         tagline   = COALESCE($4, tagline),
         image_url = COALESCE($5, image_url),
         sort      = COALESCE($6, sort),
         visible   = COALESCE($7, visible)
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        b.name ?? null,
        b.slug ?? null,
        b.tagline ?? null,
        b.imageUrl ?? null,
        b.sort ?? null,
        b.visible ?? null,
      ],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(categoryJson(rows[0]))
  }),
)

app.delete(
  '/api/categories/:id',
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM categories WHERE id = $1`, [req.params.id])
    res.json({ ok: true })
  }),
)

// ========================= Products =========================
// Public list. Filters: ?category=slug, ?featured=1, ?search=, ?limit=
// Authed + ?all=1 includes hidden products.
app.get(
  '/api/products',
  optionalAuth,
  ah(async (req, res) => {
    const where = []
    const params = []
    const includeHidden = req.admin && req.query.all === '1'
    if (!includeHidden) where.push('p.visible = true')
    if (req.query.category) {
      params.push(req.query.category)
      where.push(`c.slug = $${params.length}`)
    }
    if (req.query.featured === '1' || req.query.featured === 'true') {
      where.push('p.featured = true')
    }
    if (req.query.search) {
      params.push(`%${req.query.search}%`)
      where.push(`p.name ILIKE $${params.length}`)
    }
    let sql = `${LIST_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.sort, p.id`
    if (req.query.limit) {
      params.push(Number(req.query.limit) || 24)
      sql += ` LIMIT $${params.length}`
    }
    const { rows } = await query(sql, params)
    res.json(rows.map(productJson))
  }),
)

// Single product by slug (returns full image gallery).
app.get(
  '/api/products/:slug',
  ah(async (req, res) => {
    const { rows } = await query(`${DETAIL_SELECT} WHERE p.slug = $1`, [req.params.slug])
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(productJson(rows[0]))
  }),
)

app.post(
  '/api/products',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const name = (b.name || '').trim()
    if (!name) return res.status(400).json({ error: 'name is required' })
    const slug = (b.slug || '').trim() || slugify(name)
    const { rows } = await query(
      `INSERT INTO products
         (name, slug, tagline, description, price, old_price, category_id,
          colors, stock, is_new, featured, visible, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        name,
        slug,
        b.tagline || '',
        b.description || '',
        b.price ?? 0,
        b.oldPrice ?? null,
        b.categoryId ?? null,
        JSON.stringify(Array.isArray(b.colors) ? b.colors : []),
        b.stock ?? 0,
        b.isNew ?? false,
        b.featured ?? false,
        b.visible ?? true,
        b.sort ?? 0,
      ],
    )
    // Optional initial images.
    if (Array.isArray(b.images)) {
      for (let i = 0; i < b.images.length; i++) {
        const url = typeof b.images[i] === 'string' ? b.images[i] : b.images[i]?.url
        if (url) {
          await query(
            `INSERT INTO product_images (product_id, url, alt, sort)
             VALUES ($1,$2,$3,$4) ON CONFLICT (product_id, url) DO NOTHING`,
            [rows[0].id, url, name, i],
          )
        }
      }
    }
    const { rows: full } = await query(`${DETAIL_SELECT} WHERE p.id = $1`, [rows[0].id])
    res.status(201).json(productJson(full[0]))
  }),
)

app.put(
  '/api/products/:id',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    // Build a dynamic SET from only the provided fields.
    const sets = []
    const params = [req.params.id]
    for (const [key, col] of Object.entries(PRODUCT_COLS)) {
      if (!(key in b)) continue
      if (key === 'colors') {
        params.push(JSON.stringify(Array.isArray(b.colors) ? b.colors : []))
        sets.push(`colors = $${params.length}::jsonb`)
      } else {
        params.push(b[key])
        sets.push(`${col} = $${params.length}`)
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' })
    const { rows } = await query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $1 RETURNING id`,
      params,
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    const { rows: full } = await query(`${DETAIL_SELECT} WHERE p.id = $1`, [rows[0].id])
    res.json(productJson(full[0]))
  }),
)

app.delete(
  '/api/products/:id',
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM products WHERE id = $1`, [req.params.id])
    res.json({ ok: true })
  }),
)

// ---- Product images ----
app.post(
  '/api/products/:id/images',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    if (!b.url) return res.status(400).json({ error: 'url is required' })
    const { rows } = await query(
      `INSERT INTO product_images (product_id, url, alt, sort)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (product_id, url) DO UPDATE SET alt = EXCLUDED.alt, sort = EXCLUDED.sort
       RETURNING *`,
      [req.params.id, b.url, b.alt || '', b.sort ?? 0],
    )
    res.status(201).json({ id: rows[0].id, url: rows[0].url, alt: rows[0].alt, sort: rows[0].sort })
  }),
)

app.delete(
  '/api/products/:id/images/:imageId',
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM product_images WHERE id = $1 AND product_id = $2`, [
      req.params.imageId,
      req.params.id,
    ])
    res.json({ ok: true })
  }),
)

// ========================= Uploads =========================
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const base = slugify(path.basename(file.originalname, ext)) || 'image'
    cb(null, `${Date.now()}-${base}${ext}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } })

app.post('/api/uploads', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  res.status(201).json({ url: `${PUBLIC_URL}/uploads/${req.file.filename}` })
})

// ========================= Errors =========================
app.use((err, _req, res, _next) => {
  console.error(err)
  if (err.code === '23505') return res.status(409).json({ error: 'Duplicate (slug already exists)' })
  res.status(500).json({ error: 'Server error' })
})
