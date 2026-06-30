// Scraper bridge: runs the Python e-commerce scraper (as_store/scraper/scrape.py)
// as a background job, then ingests its products.json into the catalog —
// upserting brands, categories, products and images. Jobs are tracked in
// memory (lost on restart). Admin-only.

import express from 'express'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { requireAuth } from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SCRAPER_DIR = path.resolve(process.env.SCRAPER_DIR || path.join(__dirname, '..', '..', 'scraper'))
const SCRAPE_DIR = path.resolve(process.env.SCRAPE_DIR || path.join(__dirname, '..', 'scrapes'))
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')

const LOG_CAP = 120_000
const KEEP_JOBS = 20

fs.mkdirSync(SCRAPE_DIR, { recursive: true })

/** id -> { id, status, log, summary, error, createdAt } */
const jobs = new Map()

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

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

// Derive a short tagline from a (now markdown) description: the first real
// paragraph, skipping ## headings and - bullet lines and stripping any leftover
// markdown markers.
export function taglineFromDescription(description) {
  for (const raw of String(description || '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('-') || line.startsWith('*')) continue
    return line.replace(/[*_`]/g, '').slice(0, 90)
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
  args.push('--workers', String(Math.min(16, Math.max(1, Math.floor(num(opts.workers, 6))))))
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

export async function ingestProducts(products) {
  const brandSlugs = new Set()
  const catSlugs = new Set()
  let created = 0
  let updated = 0
  let skipped = 0

  for (const p of Array.isArray(products) ? products : []) {
    const name = decodeEntities(p?.name || '').trim()
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

    // category (first one the scraper found)
    let categoryId = null
    const catName =
      Array.isArray(p.categories) && p.categories.length ? cleanCategoryName(p.categories[0]) : ''
    if (catName) {
      const cslug = slugify(catName)
      if (cslug) {
        const { rows } = await query(
          `INSERT INTO categories (name, slug) VALUES ($1,$2)
           ON CONFLICT (slug) DO UPDATE SET name = categories.name RETURNING id`,
          [catName, cslug],
        )
        categoryId = rows[0].id
        catSlugs.add(cslug)
      }
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
    const sourceUrl = p.url || ''
    const images = Array.isArray(p.images) ? p.images.filter(Boolean) : []

    // Find an existing product by where it was scraped from (idempotent re-runs).
    let existing = null
    if (sourceUrl) {
      const { rows } = await query(`SELECT id FROM products WHERE source_url = $1 LIMIT 1`, [sourceUrl])
      existing = rows[0]
    }

    let productId
    if (existing) {
      await query(
        `UPDATE products SET name=$2, tagline=$3, description=$4, specs=$5::jsonb, price=$6,
           category_id=COALESCE($7, category_id), brand_id=COALESCE($8, brand_id)
         WHERE id=$1`,
        [existing.id, title, tagline, description, JSON.stringify(specs), price, categoryId, brandId],
      )
      productId = existing.id
      updated++
    } else {
      const slug = await uniqueSlug(title)
      const { rows } = await query(
        `INSERT INTO products (name, slug, tagline, description, specs, price, category_id, brand_id, source_url, is_new, visible)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,true,true) RETURNING id`,
        [title, slug, tagline, description, JSON.stringify(specs), price, categoryId, brandId, sourceUrl],
      )
      productId = rows[0].id
      created++
    }

    // images (cap to keep galleries sane)
    let sort = 0
    for (const url of images.slice(0, 8)) {
      await query(
        `INSERT INTO product_images (product_id, url, alt, sort)
         VALUES ($1,$2,$3,$4) ON CONFLICT (product_id, url) DO NOTHING`,
        [productId, url, title, sort++],
      )
    }
  }

  return {
    products: Array.isArray(products) ? products.length : 0,
    created,
    updated,
    skipped,
    brands: brandSlugs.size,
    categories: catSlugs.size,
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
scraperRouter.use(requireAuth)

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
    proc = spawn(PYTHON_BIN, args, { cwd: SCRAPER_DIR })
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
      job.summary = await ingestProducts(products)
      job.status = 'done'
      const s = job.summary
      append(
        `Done. ${s.created} new, ${s.updated} updated, ${s.skipped} skipped · ` +
          `${s.brands} brand(s), ${s.categories} categor(ies).\n`,
      )
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
