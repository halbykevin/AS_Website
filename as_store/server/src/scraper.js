// Scraper bridge: runs the Python e-commerce scraper (as_store/scraper/scrape.py)
// as a background job, then ingests its products.json into the catalog —
// upserting brands, categories, products and images. Jobs are tracked in
// memory (lost on restart). Admin-only.

import express from 'express'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { query } from './db.js'
import { requireAuth } from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SCRAPER_DIR = path.resolve(process.env.SCRAPER_DIR || path.join(__dirname, '..', '..', 'scraper'))
const SCRAPE_DIR = path.resolve(process.env.SCRAPE_DIR || path.join(__dirname, '..', 'scrapes'))
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')

// Where downloaded product photos land — same disk + public base the /api/uploads
// endpoint uses (app.js), so they're served by the existing /uploads static route.
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'))
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8081').replace(/\/$/, '')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const LOG_CAP = 120_000
const KEEP_JOBS = 20

fs.mkdirSync(SCRAPE_DIR, { recursive: true })

/** id -> { id, status, log, summary, error, createdAt } */
const jobs = new Map()

export const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

// Normalize a product URL so re-imports can't create duplicates via trivially
// different forms of the same address: trailing slash, #fragment, www., host
// case, and %-encoding (e.g. %e2%80%b3 vs the literal ″). The result is only an
// identity key for dedupe, never re-fetched.
export function normalizeUrl(raw) {
  if (!raw) return ''
  try {
    const u = new URL(String(raw).trim())
    u.hash = ''
    u.hostname = u.hostname.replace(/^www\./i, '').toLowerCase()
    let path = u.pathname.replace(/\/+$/, '')
    try { path = decodeURIComponent(path) } catch { /* malformed — keep raw */ }
    let search = u.search
    try { search = decodeURIComponent(search) } catch { /* malformed — keep raw */ }
    return `${u.protocol}//${u.hostname}${path}${search}`
  } catch {
    return String(raw).trim()
  }
}

// --- Image self-hosting ----------------------------------------------------
// Product photos are scraped from other shops (pacmax.me etc.). Hotlinking them
// is fragile (they can break/block) and blocks Google Merchant Center, which
// won't accept another merchant's images. So at ingest time we download each
// image onto our own disk (/uploads) and store THAT url instead of the hotlink.

// Shops show their own logo when a product has no photo — pacmax.me serves
// PACMAC.png that way. Importing it would put another shop's logo on our product
// pages, so those URLs are dropped at the door and the storefront falls back to
// the AS placeholder instead. Add more with PLACEHOLDER_IMAGE_PATTERNS
// (comma-separated regexes) without editing this file.
const DEFAULT_PLACEHOLDER_PATTERNS = [
  'pacmac\\.(png|jpe?g|webp)', // pacmax.me's logo, used on their image-less products
  'woocommerce-placeholder',
  '(^|/)placeholder[-_.]',
  'no[-_]?image',
  'coming[-_]?soon',
  'default[-_](product|image)',
]

const placeholderPatterns = [
  ...DEFAULT_PLACEHOLDER_PATTERNS,
  ...String(process.env.PLACEHOLDER_IMAGE_PATTERNS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
].map((p) => {
  try {
    return new RegExp(p, 'i')
  } catch {
    console.warn(`[scraper] ignoring invalid placeholder pattern: ${p}`)
    return null
  }
}).filter(Boolean)

export const isPlaceholderImage = (url) => !!url && placeholderPatterns.some((re) => re.test(String(url)))

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
}

// A file is already ours if it lives under our public origin or the /uploads path.
export const isLocalImage = (url) =>
  !!url && (url.startsWith(`${PUBLIC_URL}/uploads/`) || url.startsWith('/uploads/'))

// Filenames are content-addressed by the REMOTE url, so re-runs (and the
// backfill) resolve the same local file — idempotent, no re-download, no dupes.
export const imageHash = (url) =>
  createHash('sha1').update(String(url)).digest('hex').slice(0, 16)

// Cache the uploads listing once per process so the "already downloaded?" check
// is a Map lookup, not a stat (or a scan of every filename) per image.
let uploadListing = null
export function existingForHash(hash) {
  if (!uploadListing) {
    uploadListing = new Map()
    let names = []
    try { names = fs.readdirSync(UPLOAD_DIR) } catch { /* no uploads dir yet */ }
    for (const name of names) {
      const m = /^scrape-([0-9a-f]+)\./.exec(name)
      if (m && !uploadListing.has(m[1])) uploadListing.set(m[1], name)
    }
  }
  return uploadListing.get(hash) || null
}

const extFromUrl = (u) => {
  try {
    const e = path.extname(new URL(u).pathname).toLowerCase()
    return /^\.(jpe?g|png|webp|gif|avif)$/.test(e) ? (e === '.jpeg' ? '.jpg' : e) : ''
  } catch { return '' }
}

// Download a remote image into /uploads and return its local public url.
// Returns null on any failure so the caller can fall back to the hotlink and
// never lose a product's photo over one bad fetch.
export async function localizeImage(remoteUrl) {
  const url = String(remoteUrl || '').trim()
  if (!url || isLocalImage(url)) return url || null
  try {
    const hash = imageHash(url)
    const cached = existingForHash(hash)
    if (cached) return `${PUBLIC_URL}/uploads/${cached}`

    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AS-Store-image-fetch)' },
    })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (type && !type.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return null

    const ext = MIME_EXT[type] || extFromUrl(url) || '.jpg'
    const filename = `scrape-${hash}${ext}`
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf)
    if (uploadListing) uploadListing.set(hash, filename)
    return `${PUBLIC_URL}/uploads/${filename}`
  } catch {
    return null
  }
}

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)

// Decode HTML entities (&amp; &gt; &#39; …) that leak into scraped text. Runs
// twice to also handle double-encoded values (&amp;gt;).
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export function decodeEntities(str) {
  if (!str) return ''
  let s = String(str)
  for (let i = 0; i < 2; i++) {
    s = s.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : m
      }
      const v = NAMED_ENTITIES[e.toLowerCase()]
      return v != null ? v : m
    })
  }
  return s
}

// Shops often append their own name to product titles (e.g. "MSI Katana …
// Black Pacmax.me"). Strip a trailing occurrence of the source URL's hostname,
// or of its bare label when a real separator precedes it.
export function stripSiteSuffix(name, sourceUrl) {
  if (!name) return name
  let host = ''
  try {
    host = new URL(String(sourceUrl)).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    /* no usable URL — nothing to strip */
  }
  if (!host) return name
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let out = String(name).replace(new RegExp(`[\\s\\-–—|,:]*${esc(host)}\\s*$`, 'i'), '')
  const label = host.split('.')[0]
  if (label.length >= 3) {
    out = out.replace(new RegExp(`\\s*[\\-–—|,:]+\\s*${esc(label)}\\s*$`, 'i'), '')
  }
  out = out.replace(/[\s,\-–—|:]+$/, '').trim()
  return out || name
}

// Derive a short tagline from a (now markdown) description: the first real
// paragraph, skipping ## headings and - bullet lines and stripping any leftover
// markdown markers.
export function taglineFromDescription(description) {
  for (const raw of String(description || '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('-') || line.startsWith('*')) continue
    const clean = line.replace(/[*_`]/g, '').trim()
    if (clean.length <= 120) return clean
    // Cut on a word boundary so it never ends mid-word (e.g. "…and AI-").
    return clean.slice(0, 120).replace(/\s+\S*$/, '').trim() + '…'
  }
  return ''
}

// A scraped category is often a "A > B > C" breadcrumb (HTML-encoded). Decode it
// and keep the most specific (leaf) segment as the category name.
export function cleanCategoryName(raw) {
  const decoded = decodeEntities(raw)
  const segs = decoded.split(/[>›»→|]/).map((x) => x.trim()).filter(Boolean)
  return (segs.length ? segs[segs.length - 1] : decoded).trim()
}

function buildArgs(opts, outDir) {
  const mode =
    opts.mode === 'single' ? '--url'
    : opts.mode === 'crawl' ? '--crawl'
    : opts.mode === 'site' ? '--site'
    : '--auto'
  const args = ['scrape.py', mode, opts.url, '--out', outDir, '--name', 'products', '--format', 'json']

  if (opts.render) args.push('--render')
  if (opts.ignoreRobots) args.push('--no-robots')
  if (!opts.allPages) args.push('--no-pagination')

  const limit = Math.floor(num(opts.limit, 0))
  if (limit > 0) args.push('--limit', String(limit))
  args.push('--workers', String(Math.min(16, Math.max(1, Math.floor(num(opts.workers, 10))))))
  args.push('--delay', String(Math.max(0, num(opts.delay, 0.2))))

  return args
}

// ---- Ingest a scraped products.json array into the catalog ----
async function uniqueSlug(base) {
  const root = slugify(base) || 'product'
  let slug = root
  let n = 2
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rows } = await query(`SELECT 1 FROM products WHERE slug = $1 LIMIT 1`, [slug])
    if (!rows[0]) return slug
    slug = `${root}-${n++}`
  }
}

// ---- Delisting: what the source shop no longer sells -----------------------
// The upsert above is additive, so on its own the catalog only ever grows: a
// product the shop dropped keeps selling here, at a price nobody honours any
// more. These two functions make a full-site sync a mirror instead.
//
// Hiding, never deleting. `visible = false` takes it off the storefront, the
// app, search and the sitemap — which is what "removed" means to a customer —
// while the row, its photos and the link from every past order survive, and a
// wrong call costs one click to undo. See db/schema.sql (`delisted_at`).

export const hostOf = (url) => {
  try {
    return new URL(String(url)).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

// Read-only: which of our products from the scraped shop(s) were not in this
// run. Identity is the normalized source url, the same key the upsert matches
// on — so "seen" here means exactly "upserted above", and --dry-run can report
// the real answer without writing anything.
export async function findDelisted(products) {
  const seen = new Set()
  const hosts = new Set()
  for (const p of Array.isArray(products) ? products : []) {
    const url = normalizeUrl(p?.url || '')
    if (!url) continue
    seen.add(url)
    const h = hostOf(url)
    if (h) hosts.add(h)
  }
  if (!hosts.size) return { hosts: [], owned: [], missing: [], seen: 0 }

  // Scope: only products imported from the host(s) this run actually covered.
  // A hand-made product has source_url '' and can never match, and neither can
  // one imported from a different shop. Both url forms, because rows written
  // before normalizeUrl() existed may still carry the www. host.
  const likes = []
  for (const h of hosts) likes.push(`%//${h}/%`, `%//www.${h}/%`)
  const { rows: owned } = await query(
    `SELECT id, name, price, visible, delisted_at, source_url
       FROM products
      WHERE source_url <> '' AND source_url LIKE ANY($1::text[])
      ORDER BY name`,
    [likes],
  )
  const missing = owned.filter((r) => !seen.has(normalizeUrl(r.source_url)))
  return { hosts: [...hosts], owned, missing, seen: seen.size }
}

// Hide what the shop no longer lists, restore what came back.
//
// `floor` is the guard that matters: a scrape that dies halfway, gets
// rate-limited, or was run with --limit produces a short file that is
// indistinguishable from a mass delisting. Below this much coverage of what we
// already hold, the run is treated as incomplete and nothing is hidden.
export async function applyDelist(products, { floor = 0.5 } = {}) {
  const { hosts, owned, missing } = await findDelisted(products)
  const base = { hosts, checked: owned.length, hidden: 0, restored: 0, missing: missing.length }
  if (!hosts.length) return { ...base, aborted: 'the scrape produced no usable product urls' }
  if (!owned.length) return base

  const covered = owned.length - missing.length
  const ratio = covered / owned.length
  if (ratio < floor) {
    return {
      ...base,
      aborted:
        `the scrape covered only ${covered} of the ${owned.length} product(s) we hold from ` +
        `${hosts.join(', ')} (${Math.round(ratio * 100)}%, floor ${Math.round(floor * 100)}%) — ` +
        `too incomplete to tell a delisting from a failed crawl`,
      ratio,
    }
  }

  // Hide only a product that is live and unstamped. Those two conditions are
  // what keep a person's decision from being overwritten, in both directions:
  //
  //   visible = false, delisted_at IS NULL  someone hid it by hand → not ours to
  //                                         stamp, and so never auto-restored
  //   visible = true,  delisted_at NOT NULL only reachable by an admin un-hiding
  //                                         a product we delisted → they want it
  //                                         sold anyway; leave it alone
  if (missing.length) {
    const { rowCount } = await query(
      `UPDATE products SET visible = false, delisted_at = now()
        WHERE id = ANY($1::int[]) AND visible = true AND delisted_at IS NULL`,
      [missing.map((r) => r.id)],
    )
    base.hidden = rowCount
  }

  // Back on the shop: undo our own hide, and only ours.
  const gone = new Set(missing)
  const back = owned.filter((r) => r.delisted_at && !gone.has(r)).map((r) => r.id)
  if (back.length) {
    const { rowCount } = await query(
      `UPDATE products SET visible = true, delisted_at = NULL WHERE id = ANY($1::int[])`,
      [back],
    )
    base.restored = rowCount
  }
  return base
}

export async function ingestProducts(products, { delist = false, delistFloor = 0.5 } = {}) {
  const brandSlugs = new Set()
  const catSlugs = new Set()
  let created = 0
  let updated = 0
  let skipped = 0
  let placeholders = 0
  let unpriced = 0

  for (const p of Array.isArray(products) ? products : []) {
    const name = stripSiteSuffix(decodeEntities(p?.name || '').trim(), p?.url)
    const price = num(p?.price, 0) || 0
    if (!name && !price) {
      skipped++
      continue
    }
    const title = name || 'Untitled product'

    // brand (upsert by slug)
    let brandId = null
    const bname = decodeEntities(p.brand || '').trim()
    if (bname) {
      const bslug = slugify(bname)
      if (bslug) {
        const { rows } = await query(
          `INSERT INTO brands (name, slug) VALUES ($1,$2)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [bname, bslug],
        )
        brandId = rows[0].id
        brandSlugs.add(bslug)
      }
    }

    // Category hierarchy: prefer the breadcrumb path (parent → leaf), fall back
    // to the flat JSON-LD category. Build each level (2 max), link child→parent,
    // and assign the product to the LEAF (most specific) category.
    let categoryId = null
    const rawPath =
      Array.isArray(p.category_path) && p.category_path.length
        ? p.category_path
        : Array.isArray(p.categories) && p.categories.length
          ? [cleanCategoryName(p.categories[0])]
          : []
    // Clean, drop blanks, de-dupe by slug (avoids a self-parent), cap at 2 levels.
    const pathNames = []
    const seenSlugs = new Set()
    for (const nm of rawPath) {
      const clean = cleanCategoryName(nm)
      const s = slugify(clean)
      if (clean && s && !seenSlugs.has(s)) {
        seenSlugs.add(s)
        pathNames.push(clean)
      }
      if (pathNames.length >= 2) break
    }
    let parentId = null
    for (const nm of pathNames) {
      const cslug = slugify(nm)
      const { rows } = await query(
        `INSERT INTO categories (name, slug, parent_id) VALUES ($1,$2,$3)
         ON CONFLICT (slug) DO UPDATE SET
            name = categories.name,
            parent_id = COALESCE(categories.parent_id, EXCLUDED.parent_id)
         RETURNING id`,
        [nm, cslug, parentId],
      )
      const id = rows[0].id
      catSlugs.add(cslug)
      parentId = id
      categoryId = id // leaf so far
    }

    const description = decodeEntities(p.description || '').trim()
    const tagline = taglineFromDescription(description)
    // Spec rows arrive as [[label, value], ...]; keep only clean 2-string pairs.
    const specs = Array.isArray(p.specs)
      ? p.specs
          .filter((r) => Array.isArray(r) && r.length >= 2)
          .map((r) => [decodeEntities(String(r[0])).trim(), decodeEntities(String(r[1])).trim()])
          .filter((r) => r[0] && r[1])
      : []
    const sourceUrl = normalizeUrl(p.url || '')
    const allImages = Array.isArray(p.images) ? p.images.filter(Boolean) : []
    const images = allImages.filter((u) => !isPlaceholderImage(u))
    placeholders += allImages.length - images.length

    // Find an existing product by where it was scraped from (idempotent re-runs).
    // Match the normalized URL, but also the raw form so rows saved before this
    // normalization still update instead of duplicating.
    let existing = null
    if (sourceUrl) {
      const { rows } = await query(
        `SELECT id FROM products WHERE source_url = $1 OR source_url = $2 LIMIT 1`,
        [sourceUrl, p.url || ''],
      )
      existing = rows[0]
    }

    let productId
    if (existing) {
      await query(
        `UPDATE products SET name=$2, tagline=$3, description=$4, specs=$5::jsonb, price=$6,
           category_id=COALESCE($7, category_id), brand_id=COALESCE($8, brand_id), source_url=$9
         WHERE id=$1`,
        [existing.id, title, tagline, description, JSON.stringify(specs), price, categoryId, brandId, sourceUrl],
      )
      productId = existing.id
      updated++
    } else {
      const slug = await uniqueSlug(title)
      // Shops hide the price on "call us" items; the scrape brings those in at 0,
      // and a live product priced $0.00 is worse than no product. Import it
      // hidden so it lands in the admin to be priced. Only ever decided here, on
      // INSERT — a re-import never flips the visibility you chose.
      const priced = price > 0
      if (!priced) unpriced++
      const { rows } = await query(
        `INSERT INTO products (name, slug, tagline, description, specs, price, category_id, brand_id, source_url, is_new, visible)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,true,$10) RETURNING id`,
        [title, slug, tagline, description, JSON.stringify(specs), price, categoryId, brandId, sourceUrl, priced],
      )
      productId = rows[0].id
      created++
    }

    // images (cap to keep galleries sane) — download each onto our own /uploads
    // so we never hotlink the source shop. Falls back to the remote url if a
    // download fails so a product still shows a photo. Non-destructive
    // (ON CONFLICT DO NOTHING) so admin-added images survive a re-scrape.
    let sort = 0
    for (const remote of images.slice(0, 8)) {
      const url = (await localizeImage(remote)) || remote
      await query(
        `INSERT INTO product_images (product_id, url, alt, sort)
         VALUES ($1,$2,$3,$4) ON CONFLICT (product_id, url) DO NOTHING`,
        [productId, url, title, sort++],
      )
    }
  }

  // After the upserts, never before: a product is only "missing" once
  // everything the file does contain has been written.
  const delisted = delist ? await applyDelist(products, { floor: delistFloor }) : null

  return {
    products: Array.isArray(products) ? products.length : 0,
    created,
    updated,
    skipped,
    placeholders,
    unpriced,
    brands: brandSlugs.size,
    categories: catSlugs.size,
    delisted,
  }
}

function jobView(j) {
  return { id: j.id, status: j.status, log: j.log, summary: j.summary, error: j.error }
}

function prune() {
  try {
    const dirs = fs
      .readdirSync(SCRAPE_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ name: d.name, t: fs.statSync(path.join(SCRAPE_DIR, d.name)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const d of dirs.slice(KEEP_JOBS)) {
      fs.rmSync(path.join(SCRAPE_DIR, d.name), { recursive: true, force: true })
    }
  } catch {
    /* ignore */
  }
}

export const scraperRouter = express.Router()
// Scoped to /api/scrape on purpose: this router is mounted at the root, so an
// unscoped `use` would put admin auth in front of every route mounted after it
// (it shadowed the whole customer notifications API) and turn 404s into 401s.
scraperRouter.use('/api/scrape', requireAuth)

scraperRouter.post('/api/scrape', (req, res) => {
  const opts = req.body || {}
  if (!opts.url || !/^https?:\/\//i.test(opts.url)) {
    return res.status(400).json({ error: 'A valid http(s) URL is required' })
  }

  const id = randomUUID()
  const outDir = path.join(SCRAPE_DIR, id)
  fs.mkdirSync(outDir, { recursive: true })

  const job = { id, status: 'running', log: '', summary: null, error: null, createdAt: Date.now() }
  jobs.set(id, job)
  const append = (chunk) => {
    job.log = (job.log + chunk.toString()).slice(-LOG_CAP)
  }

  const args = buildArgs(opts, outDir)
  append(`$ ${PYTHON_BIN} ${args.join(' ')}\n`)

  let proc
  try {
    // PYTHONUNBUFFERED: piped stdout is block-buffered by default, which makes
    // the run log arrive in rare big chunks instead of streaming line by line.
    proc = spawn(PYTHON_BIN, args, {
      cwd: SCRAPER_DIR,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })
  } catch (e) {
    job.status = 'error'
    job.error = `Failed to launch Python: ${e.message}`
    return res.status(202).json(jobView(job))
  }

  proc.stdout.on('data', append)
  proc.stderr.on('data', append)
  proc.on('error', (e) => {
    job.status = 'error'
    job.error = `Failed to launch Python (${PYTHON_BIN}): ${e.message}`
  })
  proc.on('close', async (code) => {
    if (job.status === 'error') return
    try {
      const file = path.join(outDir, 'products.json')
      if (!fs.existsSync(file)) {
        job.status = 'error'
        job.error = 'The scraper produced no products. Check the URL/log above.'
        append(`\n[exit ${code}] no products.json written.`)
        return
      }
      const products = JSON.parse(fs.readFileSync(file, 'utf8'))
      append(`\nIngesting ${products.length} scraped product(s) into the catalog…\n`)
      // Delisting is only meaningful for a run that saw the whole shop: a
      // single-product or --limit run legitimately returns a fraction of the
      // catalog, and treating the rest as gone would empty the store. Opt-in,
      // and only where the request could have covered everything.
      const delist = Boolean(opts.delist) && opts.mode === 'site' && !(Math.floor(num(opts.limit, 0)) > 0)
      job.summary = await ingestProducts(products, { delist })
      job.status = 'done'
      const s = job.summary
      append(
        `Done. ${s.created} new, ${s.updated} updated, ${s.skipped} skipped · ` +
          `${s.brands} brand(s), ${s.categories} categor(ies).\n`,
      )
      if (s.delisted) {
        append(
          s.delisted.aborted
            ? `Delisting skipped — ${s.delisted.aborted}\n`
            : `Delisted: ${s.delisted.hidden} hidden, ${s.delisted.restored} restored.\n`,
        )
      }
    } catch (e) {
      job.status = 'error'
      job.error = e.message
      append(`\n[ingest error] ${e.message}\n`)
    } finally {
      prune()
    }
  })

  res.status(202).json(jobView(job))
})

scraperRouter.get('/api/scrape/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  res.json(jobView(job))
})
