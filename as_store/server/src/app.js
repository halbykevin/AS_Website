import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { query } from './db.js'
import { login, requireAuth, optionalAuth } from './auth.js'
import { hashPassword, verifyPassword, signCustomerToken, requireCustomer } from './customerAuth.js'
import { scraperRouter } from './scraper.js'

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
  showInNav: r.show_in_nav,
})

const brandJson = (r) => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
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
  specs: Array.isArray(r.specs) ? r.specs : [],
  price: r.price,
  oldPrice: r.old_price,
  categoryId: r.category_id,
  category: r.category_name || '',
  categorySlug: r.category_slug || '',
  brandId: r.brand_id,
  brand: r.brand_name || '',
  sourceUrl: r.source_url || '',
  colors: Array.isArray(r.colors) ? r.colors : [],
  stock: r.stock,
  isNew: r.is_new,
  featured: r.featured,
  visible: r.visible,
  sort: r.sort,
  image: r.image || (Array.isArray(r.images) ? r.images[0] : '') || '',
  images: Array.isArray(r.images) ? r.images : [],
})

const settingsJson = (r) => ({
  storeName: r.store_name || 'AS Store',
  announcement: { enabled: r.announcement_enabled, text: r.announcement_text || '' },
  contact: {
    email: r.contact_email || '',
    phone: r.contact_phone || '',
    whatsapp: r.contact_whatsapp || '',
    address: r.contact_address || '',
  },
  socials: r.socials || {},
  navLinks: Array.isArray(r.nav_links) ? r.nav_links : [],
  footerGroups: Array.isArray(r.footer_groups) ? r.footer_groups : [],
  showcaseBg: r.showcase_bg || '#000000',
  updatedAt: r.updated_at,
})

const pageJson = (r) => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  body: r.body || '',
  visible: r.visible,
  sort: r.sort,
  updatedAt: r.updated_at,
})

const customerJson = (r) => ({
  id: r.id,
  name: r.name || '',
  email: r.email,
  phone: r.phone || '',
  address: r.address || '',
  createdAt: r.created_at,
})

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']

const orderItemJson = (r) => ({
  id: r.id,
  productId: r.product_id,
  name: r.name || '',
  price: r.price,
  qty: r.qty,
  image: r.image || '',
})

const orderJson = (r) => ({
  id: r.id,
  status: r.status,
  fullName: r.full_name || '',
  phone: r.phone || '',
  address: r.address || '',
  city: r.city || '',
  notes: r.notes || '',
  subtotal: r.subtotal,
  paymentMethod: r.payment_method || 'cod',
  customerId: r.customer_id,
  customerEmail: r.customer_email, // present on admin queries
  itemCount: r.item_count, // present on list queries
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

async function loadOrderDetail(id) {
  const { rows } = await query(
    `SELECT o.*, c.email AS customer_email
     FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1`,
    [id],
  )
  if (!rows[0]) return null
  const { rows: items } = await query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`, [id])
  return { ...orderJson(rows[0]), items: items.map(orderItemJson) }
}

const sectionJson = (r) => ({
  id: r.id,
  type: r.type,
  eyebrow: r.eyebrow || '',
  heading: r.heading || '',
  subheading: r.subheading || '',
  body: r.body || '',
  imageUrl: r.image_url || '',
  bg: r.bg || '',
  textTheme: r.text_theme || 'auto',
  settings: r.settings && typeof r.settings === 'object' ? r.settings : {},
  visible: r.visible,
  sort: r.sort,
})

// Columns that admin create/update accept for homepage sections.
const SECTION_COLS = {
  type: 'type',
  eyebrow: 'eyebrow',
  heading: 'heading',
  subheading: 'subheading',
  body: 'body',
  imageUrl: 'image_url',
  bg: 'bg',
  textTheme: 'text_theme',
  settings: 'settings',
  visible: 'visible',
  sort: 'sort',
}

// Shared SELECT fragments.
const LIST_SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug, b.name AS brand_name,
    (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id
       ORDER BY pi.sort, pi.id LIMIT 1) AS image
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id`

const DETAIL_SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug, b.name AS brand_name,
    COALESCE((SELECT json_agg(pi.url ORDER BY pi.sort, pi.id)
              FROM product_images pi WHERE pi.product_id = p.id), '[]') AS images
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id`

// Columns that admin create/update accept, mapped from camelCase body keys.
const PRODUCT_COLS = {
  name: 'name',
  slug: 'slug',
  tagline: 'tagline',
  description: 'description',
  specs: 'specs',
  price: 'price',
  oldPrice: 'old_price',
  categoryId: 'category_id',
  brandId: 'brand_id',
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

// ========================= Customer accounts =========================
app.post(
  '/api/account/register',
  ah(async (req, res) => {
    const b = req.body || {}
    const email = (b.email || '').trim().toLowerCase()
    const password = b.password || ''
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
    const dupe = await query(`SELECT 1 FROM customers WHERE email = $1`, [email])
    if (dupe.rows[0]) return res.status(409).json({ error: 'An account with this email already exists' })
    const { rows } = await query(
      `INSERT INTO customers (name, email, password_hash, phone, address)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [(b.name || '').trim(), email, hashPassword(password), b.phone || '', b.address || ''],
    )
    res.status(201).json({ token: signCustomerToken(rows[0]), customer: customerJson(rows[0]) })
  }),
)

app.post(
  '/api/account/login',
  ah(async (req, res) => {
    const email = (req.body?.email || '').trim().toLowerCase()
    const password = req.body?.password || ''
    const { rows } = await query(`SELECT * FROM customers WHERE email = $1`, [email])
    const customer = rows[0]
    if (!customer || !verifyPassword(password, customer.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    res.json({ token: signCustomerToken(customer), customer: customerJson(customer) })
  }),
)

app.get(
  '/api/account/me',
  requireCustomer,
  ah(async (req, res) => {
    const { rows } = await query(`SELECT * FROM customers WHERE id = $1`, [req.customerId])
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(customerJson(rows[0]))
  }),
)

app.put(
  '/api/account',
  requireCustomer,
  ah(async (req, res) => {
    const b = req.body || {}
    const params = [req.customerId, b.name ?? null, b.phone ?? null, b.address ?? null]
    let passSet = ''
    if (b.password) {
      if (b.password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
      params.push(hashPassword(b.password))
      passSet = `, password_hash = $${params.length}`
    }
    const { rows } = await query(
      `UPDATE customers SET
         name = COALESCE($2, name), phone = COALESCE($3, phone), address = COALESCE($4, address)${passSet}
       WHERE id = $1 RETURNING *`,
      params,
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(customerJson(rows[0]))
  }),
)

// ========================= Orders =========================
// Place an order (cash on delivery). Prices/names are taken from the DB, never
// trusted from the client. Optionally saves the delivery address to the profile.
app.post(
  '/api/orders',
  requireCustomer,
  ah(async (req, res) => {
    const b = req.body || {}
    const cleaned = (Array.isArray(b.items) ? b.items : [])
      .map((i) => ({ productId: Number(i.productId), qty: Math.max(1, Math.floor(Number(i.qty) || 1)) }))
      .filter((i) => i.productId)
    if (!cleaned.length) return res.status(400).json({ error: 'Your bag is empty' })

    const fullName = (b.fullName || '').trim()
    const phone = (b.phone || '').trim()
    const address = (b.address || '').trim()
    if (!fullName || !phone || !address) {
      return res.status(400).json({ error: 'Name, phone and address are required' })
    }

    const ids = cleaned.map((i) => i.productId)
    const { rows: prods } = await query(
      `SELECT p.id, p.name, p.price,
        (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort, pi.id LIMIT 1) AS image
       FROM products p WHERE p.id = ANY($1)`,
      [ids],
    )
    const byId = new Map(prods.map((p) => [p.id, p]))
    const items = []
    let subtotal = 0
    for (const it of cleaned) {
      const p = byId.get(it.productId)
      if (!p) continue
      const price = Number(p.price) || 0
      subtotal += price * it.qty
      items.push({ productId: p.id, name: p.name, price, qty: it.qty, image: p.image || '' })
    }
    if (!items.length) return res.status(400).json({ error: 'None of those items are available' })

    const { rows } = await query(
      `INSERT INTO orders (customer_id, status, full_name, phone, address, city, notes, subtotal, payment_method)
       VALUES ($1,'pending',$2,$3,$4,$5,$6,$7,'cod') RETURNING id`,
      [req.customerId, fullName, phone, address, b.city || '', b.notes || '', subtotal],
    )
    const orderId = rows[0].id
    for (const it of items) {
      await query(
        `INSERT INTO order_items (order_id, product_id, name, price, qty, image)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orderId, it.productId, it.name, it.price, it.qty, it.image],
      )
    }
    if (b.saveAddress) {
      await query(
        `UPDATE customers SET name = COALESCE(NULLIF($2,''), name), phone = $3, address = $4 WHERE id = $1`,
        [req.customerId, fullName, phone, address],
      )
    }
    res.status(201).json(await loadOrderDetail(orderId))
  }),
)

app.get(
  '/api/orders',
  requireCustomer,
  ah(async (req, res) => {
    const { rows } = await query(
      `SELECT o.*, (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id)::int AS item_count
       FROM orders o WHERE o.customer_id = $1 ORDER BY o.id DESC`,
      [req.customerId],
    )
    res.json(rows.map(orderJson))
  }),
)

app.get(
  '/api/orders/:id',
  requireCustomer,
  ah(async (req, res) => {
    const order = await loadOrderDetail(req.params.id)
    if (!order || order.customerId !== req.customerId) return res.status(404).json({ error: 'Not found' })
    res.json(order)
  }),
)

// ---- Admin order management ----
app.get(
  '/api/admin/orders',
  requireAuth,
  ah(async (req, res) => {
    const where = []
    const params = []
    if (req.query.status && ORDER_STATUSES.includes(req.query.status)) {
      params.push(req.query.status)
      where.push(`o.status = $${params.length}`)
    }
    const { rows } = await query(
      `SELECT o.*, c.email AS customer_email,
        (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id)::int AS item_count
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY o.id DESC`,
      params,
    )
    res.json(rows.map(orderJson))
  }),
)

app.get(
  '/api/admin/orders/:id',
  requireAuth,
  ah(async (req, res) => {
    const order = await loadOrderDetail(req.params.id)
    if (!order) return res.status(404).json({ error: 'Not found' })
    res.json(order)
  }),
)

app.put(
  '/api/admin/orders/:id',
  requireAuth,
  ah(async (req, res) => {
    const status = req.body?.status
    if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' })
    const { rows } = await query(`UPDATE orders SET status = $2 WHERE id = $1 RETURNING id`, [
      req.params.id,
      status,
    ])
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(await loadOrderDetail(rows[0].id))
  }),
)

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
      `INSERT INTO categories (name, slug, tagline, image_url, sort, visible, show_in_nav)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, slug, b.tagline || '', b.imageUrl || '', b.sort ?? 0, b.visible ?? true, b.showInNav ?? false],
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
         name        = COALESCE($2, name),
         slug        = COALESCE($3, slug),
         tagline     = COALESCE($4, tagline),
         image_url   = COALESCE($5, image_url),
         sort        = COALESCE($6, sort),
         visible     = COALESCE($7, visible),
         show_in_nav = COALESCE($8, show_in_nav)
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        b.name ?? null,
        b.slug ?? null,
        b.tagline ?? null,
        b.imageUrl ?? null,
        b.sort ?? null,
        b.visible ?? null,
        b.showInNav ?? null,
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
         (name, slug, tagline, description, specs, price, old_price, category_id, brand_id,
          colors, stock, is_new, featured, visible, sort)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        name,
        slug,
        b.tagline || '',
        b.description || '',
        JSON.stringify(Array.isArray(b.specs) ? b.specs : []),
        b.price ?? 0,
        b.oldPrice ?? null,
        b.categoryId ?? null,
        b.brandId ?? null,
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
      if (key === 'colors' || key === 'specs') {
        params.push(JSON.stringify(Array.isArray(b[key]) ? b[key] : []))
        sets.push(`${col} = $${params.length}::jsonb`)
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
app.get(
  '/api/products/:id/images',
  requireAuth,
  ah(async (req, res) => {
    const { rows } = await query(
      `SELECT id, url, alt, sort FROM product_images WHERE product_id = $1 ORDER BY sort, id`,
      [req.params.id],
    )
    res.json(rows.map((r) => ({ id: r.id, url: r.url, alt: r.alt, sort: r.sort })))
  }),
)

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

// ========================= Brands =========================
app.get(
  '/api/brands',
  optionalAuth,
  ah(async (req, res) => {
    const all = req.admin && req.query.all === '1'
    const { rows } = await query(
      `SELECT * FROM brands ${all ? '' : 'WHERE visible = true'} ORDER BY sort, name`,
    )
    res.json(rows.map(brandJson))
  }),
)

app.post(
  '/api/brands',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const name = (b.name || '').trim()
    if (!name) return res.status(400).json({ error: 'name is required' })
    const slug = (b.slug || '').trim() || slugify(name)
    const { rows } = await query(
      `INSERT INTO brands (name, slug, image_url, sort, visible)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, slug, b.imageUrl || '', b.sort ?? 0, b.visible ?? true],
    )
    res.status(201).json(brandJson(rows[0]))
  }),
)

app.put(
  '/api/brands/:id',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const { rows } = await query(
      `UPDATE brands SET
         name      = COALESCE($2, name),
         slug      = COALESCE($3, slug),
         image_url = COALESCE($4, image_url),
         sort      = COALESCE($5, sort),
         visible   = COALESCE($6, visible)
       WHERE id = $1 RETURNING *`,
      [req.params.id, b.name ?? null, b.slug ?? null, b.imageUrl ?? null, b.sort ?? null, b.visible ?? null],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(brandJson(rows[0]))
  }),
)

app.delete(
  '/api/brands/:id',
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM brands WHERE id = $1`, [req.params.id])
    res.json({ ok: true })
  }),
)

// ========================= Settings =========================
app.get(
  '/api/settings',
  ah(async (req, res) => {
    await query(`INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`)
    const { rows } = await query(`SELECT * FROM settings WHERE id = 1`)
    res.json(settingsJson(rows[0]))
  }),
)

app.put(
  '/api/settings',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    await query(`INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`)
    const { rows } = await query(
      `UPDATE settings SET
         store_name           = COALESCE($1, store_name),
         announcement_enabled = COALESCE($2, announcement_enabled),
         announcement_text    = COALESCE($3, announcement_text),
         contact_email        = COALESCE($4, contact_email),
         contact_phone        = COALESCE($5, contact_phone),
         contact_whatsapp     = COALESCE($6, contact_whatsapp),
         contact_address      = COALESCE($7, contact_address),
         socials              = COALESCE($8::jsonb, socials),
         nav_links            = COALESCE($9::jsonb, nav_links),
         footer_groups        = COALESCE($10::jsonb, footer_groups),
         showcase_bg          = COALESCE($11, showcase_bg)
       WHERE id = 1 RETURNING *`,
      [
        b.storeName ?? null,
        b.announcement?.enabled ?? null,
        b.announcement?.text ?? null,
        b.contact?.email ?? null,
        b.contact?.phone ?? null,
        b.contact?.whatsapp ?? null,
        b.contact?.address ?? null,
        b.socials ? JSON.stringify(b.socials) : null,
        b.navLinks ? JSON.stringify(b.navLinks) : null,
        b.footerGroups ? JSON.stringify(b.footerGroups) : null,
        b.showcaseBg ?? null,
      ],
    )
    res.json(settingsJson(rows[0]))
  }),
)

// ========================= Pages =========================
app.get(
  '/api/pages',
  optionalAuth,
  ah(async (req, res) => {
    const all = req.admin && req.query.all === '1'
    const { rows } = await query(
      `SELECT * FROM pages ${all ? '' : 'WHERE visible = true'} ORDER BY sort, id`,
    )
    res.json(rows.map(pageJson))
  }),
)

app.get(
  '/api/pages/:slug',
  ah(async (req, res) => {
    const { rows } = await query(`SELECT * FROM pages WHERE slug = $1`, [req.params.slug])
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(pageJson(rows[0]))
  }),
)

app.post(
  '/api/pages',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const title = (b.title || '').trim()
    if (!title) return res.status(400).json({ error: 'title is required' })
    const slug = (b.slug || '').trim() || slugify(title)
    const { rows } = await query(
      `INSERT INTO pages (slug, title, body, visible, sort)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [slug, title, b.body || '', b.visible ?? true, b.sort ?? 0],
    )
    res.status(201).json(pageJson(rows[0]))
  }),
)

app.put(
  '/api/pages/:id',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const { rows } = await query(
      `UPDATE pages SET
         slug    = COALESCE($2, slug),
         title   = COALESCE($3, title),
         body    = COALESCE($4, body),
         visible = COALESCE($5, visible),
         sort    = COALESCE($6, sort)
       WHERE id = $1 RETURNING *`,
      [req.params.id, b.slug ?? null, b.title ?? null, b.body ?? null, b.visible ?? null, b.sort ?? null],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(pageJson(rows[0]))
  }),
)

app.delete(
  '/api/pages/:id',
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM pages WHERE id = $1`, [req.params.id])
    res.json({ ok: true })
  }),
)

// ========================= Homepage sections =========================
// Public: visible blocks in order. Authed + ?all=1 includes hidden ones.
app.get(
  '/api/homepage-sections',
  optionalAuth,
  ah(async (req, res) => {
    const all = req.admin && req.query.all === '1'
    const { rows } = await query(
      `SELECT * FROM homepage_sections ${all ? '' : 'WHERE visible = true'} ORDER BY sort, id`,
    )
    res.json(rows.map(sectionJson))
  }),
)

app.post(
  '/api/homepage-sections',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const type = (b.type || '').trim()
    if (!type) return res.status(400).json({ error: 'type is required' })
    // New blocks go to the end unless a sort is given.
    const { rows: mx } = await query(`SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM homepage_sections`)
    const { rows } = await query(
      `INSERT INTO homepage_sections
         (type, eyebrow, heading, subheading, body, image_url, bg, text_theme, settings, visible, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING *`,
      [
        type,
        b.eyebrow || '',
        b.heading || '',
        b.subheading || '',
        b.body || '',
        b.imageUrl || '',
        b.bg || '',
        b.textTheme || 'auto',
        JSON.stringify(b.settings && typeof b.settings === 'object' ? b.settings : {}),
        b.visible ?? true,
        b.sort ?? mx[0].next,
      ],
    )
    res.status(201).json(sectionJson(rows[0]))
  }),
)

// Reorder: body { ids: [...] } -> sort follows array order. Defined as its own
// path so it never collides with PUT /:id.
app.post(
  '/api/homepage-sections/reorder',
  requireAuth,
  ah(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    for (let i = 0; i < ids.length; i++) {
      await query(`UPDATE homepage_sections SET sort = $2 WHERE id = $1`, [ids[i], i + 1])
    }
    const { rows } = await query(`SELECT * FROM homepage_sections ORDER BY sort, id`)
    res.json(rows.map(sectionJson))
  }),
)

app.put(
  '/api/homepage-sections/:id',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const sets = []
    const params = [req.params.id]
    for (const [key, col] of Object.entries(SECTION_COLS)) {
      if (!(key in b)) continue
      if (key === 'settings') {
        params.push(JSON.stringify(b.settings && typeof b.settings === 'object' ? b.settings : {}))
        sets.push(`settings = $${params.length}::jsonb`)
      } else {
        params.push(b[key])
        sets.push(`${col} = $${params.length}`)
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' })
    const { rows } = await query(
      `UPDATE homepage_sections SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(sectionJson(rows[0]))
  }),
)

app.delete(
  '/api/homepage-sections/:id',
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM homepage_sections WHERE id = $1`, [req.params.id])
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

// ========================= Scraper =========================
// Spawns the Python scraper and ingests its output into the catalog.
app.use(scraperRouter)

// ========================= Errors =========================
app.use((err, _req, res, _next) => {
  console.error(err)
  if (err.code === '23505') return res.status(409).json({ error: 'Duplicate (slug already exists)' })
  res.status(500).json({ error: 'Server error' })
})
