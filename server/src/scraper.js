// Web scraper bridge: lets the admin dashboard run the Python e-commerce
// scraper (../../WebScarping/scrape.py) as a background job and download its
// output. Each run gets its own folder under SCRAPE_DIR; the admin UI polls
// for status/log and pulls the result files (and a zip of everything).

import express from 'express'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import archiver from 'archiver'
import { requireAuth } from './auth.js'
import { query } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Where the Python scraper lives, where to write run output, and how to invoke
// Python — all overridable via env for the VPS.
const SCRAPER_DIR = path.resolve(
  process.env.SCRAPER_DIR || path.join(__dirname, '..', '..', 'WebScarping')
)
const SCRAPE_DIR = path.resolve(
  process.env.SCRAPE_DIR || path.join(__dirname, '..', 'scrapes')
)
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')

const KEEP_JOBS = 20 // prune older run folders beyond this many
const LOG_CAP = 200_000 // keep at most ~200 KB of log per job in memory
const ALLOWED_FORMATS = ['json', 'csv', 'xlsx', 'html']

fs.mkdirSync(SCRAPE_DIR, { recursive: true })

/** id -> { id, status, log, error, createdAt, opts, files, imageCount, proc } */
const jobs = new Map()

const num = (v, dflt) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : dflt
}

function buildArgs(opts, outDir) {
  const mode = opts.mode === 'single' ? '--url' : opts.mode === 'crawl' ? '--crawl' : '--auto'
  const args = ['scrape.py', mode, opts.url, '--out', outDir, '--name', 'products']

  const formats = (Array.isArray(opts.formats) ? opts.formats : []).filter((f) =>
    ALLOWED_FORMATS.includes(f)
  )
  args.push('--format', ...(formats.length ? formats : ALLOWED_FORMATS))

  if (opts.downloadImages) args.push('--images')
  if (opts.render) args.push('--render')
  if (opts.ignoreRobots) args.push('--no-robots')
  if (!opts.allPages) args.push('--no-pagination')

  const limit = Math.floor(num(opts.limit, 0))
  if (limit > 0) args.push('--limit', String(limit))

  const workers = Math.min(32, Math.max(1, Math.floor(num(opts.workers, 8))))
  args.push('--workers', String(workers))

  const delay = Math.max(0, num(opts.delay, 0.2))
  args.push('--delay', String(delay))

  return args
}

// Top-level export files (json/csv/xlsx/html) produced by a run, with sizes.
function listOutputFiles(outDir) {
  if (!fs.existsSync(outDir)) return []
  return fs
    .readdirSync(outDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => {
      const stat = fs.statSync(path.join(outDir, d.name))
      return { name: d.name, size: stat.size }
    })
}

function countImages(outDir) {
  const dir = path.join(outDir, 'images')
  if (!fs.existsSync(dir)) return 0
  return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).length
}

function jobView(job) {
  return {
    id: job.id,
    kind: job.kind || 'products',
    status: job.status,
    log: job.log,
    error: job.error,
    createdAt: job.createdAt,
    files: job.files,
    imageCount: job.imageCount,
    summary: job.summary || null,
  }
}

// Keep only the most recent KEEP_JOBS finished runs on disk and in memory.
function pruneJobs() {
  const finished = [...jobs.values()]
    .filter((j) => j.status !== 'running')
    .sort((a, b) => b.createdAt - a.createdAt)
  for (const job of finished.slice(KEEP_JOBS)) {
    jobs.delete(job.id)
    fs.rm(path.join(SCRAPE_DIR, job.id), { recursive: true, force: true }, () => {})
  }
}

function startJob(opts) {
  const id = randomUUID()
  const outDir = path.join(SCRAPE_DIR, id)
  fs.mkdirSync(outDir, { recursive: true })

  const job = {
    id,
    status: 'running',
    log: '',
    error: null,
    createdAt: Date.now(),
    opts,
    files: [],
    imageCount: 0,
    proc: null,
  }
  jobs.set(id, job)

  const args = buildArgs(opts, outDir)
  const proc = spawn(PYTHON_BIN, args, { cwd: SCRAPER_DIR, windowsHide: true })
  job.proc = proc

  const append = (buf) => {
    job.log += buf.toString()
    if (job.log.length > LOG_CAP) job.log = job.log.slice(-LOG_CAP)
  }
  proc.stdout.on('data', append)
  proc.stderr.on('data', append)

  proc.on('error', (err) => {
    job.status = 'error'
    job.error =
      err.code === 'ENOENT'
        ? `Could not run "${PYTHON_BIN}". Install Python and the scraper deps, or set PYTHON_BIN.`
        : err.message
    job.log += `\n[error] ${job.error}\n`
  })

  proc.on('close', (code) => {
    job.proc = null
    job.files = listOutputFiles(outDir)
    job.imageCount = countImages(outDir)
    if (job.status !== 'error') {
      job.status = code === 0 ? 'done' : 'error'
      if (code !== 0) job.error = `Scraper exited with code ${code}`
    }
    pruneJobs()
  })

  return job
}

// ---------------------------------------------------------------------------
// Ticketing Box Office events sync: run tbo_events.py → ingest the JSON into the
// events + categories tables (idempotent, keyed on source + external_id).
// ---------------------------------------------------------------------------
const slugify = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const makeExcerpt = (desc) => {
  const line = String(desc || '').replace(/\s+/g, ' ').trim()
  return line.length > 140 ? line.slice(0, 137) + '…' : line
}

async function uniqueSlug(base, extId) {
  const slug = base || 'event'
  const { rows } = await query('SELECT 1 FROM events WHERE slug=$1', [slug])
  if (!rows[0]) return slug
  return `${slug}-${String(extId).replace(/\D/g, '') || Date.now()}`
}

async function ingestEvents(jsonPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const cats = Array.isArray(data.categories) ? data.categories : []
  const events = Array.isArray(data.events) ? data.events : []

  // Upsert categories by slug (fill the tile image only if we don't have one yet).
  let sort = 0
  for (const c of cats) {
    const slug = c.slug || slugify(c.name)
    if (!slug) continue
    await query(
      `INSERT INTO categories (name, slug, image_url, sort, visible)
       VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name,
         image_url = CASE WHEN categories.image_url = '' THEN EXCLUDED.image_url ELSE categories.image_url END`,
      [c.name || slug, slug, c.image || '', sort++]
    )
  }
  const catRows = await query('SELECT id, slug FROM categories')
  const catBySlug = new Map(catRows.rows.map((r) => [r.slug, r.id]))

  let created = 0
  let updated = 0
  for (const e of events) {
    const categoryId = catBySlug.get(slugify(e.categoryName || '')) || null
    const v = [
      e.title || '', e.primaryDate || null, e.primaryTime || '', e.venue || '', e.city || '',
      e.imageUrl || '', e.ticketUrl || '', makeExcerpt(e.description), e.description || '',
      categoryId, JSON.stringify(Array.isArray(e.dates) ? e.dates : []),
    ]
    const existing = await query(
      'SELECT id FROM events WHERE source=$1 AND external_id=$2',
      ['ticketingboxoffice', String(e.externalId || '')]
    )
    if (existing.rows[0]) {
      await query(
        `UPDATE events SET title=$1, date=$2, time=$3, venue=$4, city=$5, image_url=$6,
           ticket_url=$7, excerpt=$8, description=$9, category_id=$10, dates=$11
         WHERE id=$12`,
        [...v, existing.rows[0].id]
      )
      updated++
    } else {
      const slug = await uniqueSlug(slugify(e.title), e.externalId)
      await query(
        `INSERT INTO events
           (title, slug, date, time, venue, city, image_url, ticket_url, status,
            excerpt, description, sort, category_id, dates, source, external_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10,0,$11,$12,'ticketingboxoffice',$13)`,
        [v[0], slug, v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], String(e.externalId || '')]
      )
      created++
    }
  }
  return { categories: cats.length, events: events.length, created, updated }
}

function startEventsJob(opts) {
  const id = randomUUID()
  const outDir = path.join(SCRAPE_DIR, id)
  fs.mkdirSync(outDir, { recursive: true })
  const jsonPath = path.join(outDir, 'events.json')

  const job = {
    id, kind: 'events', status: 'running', log: '', error: null,
    createdAt: Date.now(), files: [], imageCount: 0, summary: null, proc: null,
  }
  jobs.set(id, job)

  const delay = Math.max(0, num(opts.delay, 0.3))
  const args = ['tbo_events.py', '--out', jsonPath, '--delay', String(delay)]
  if (Math.floor(num(opts.limit, 0)) > 0) args.push('--limit', String(Math.floor(opts.limit)))

  const proc = spawn(PYTHON_BIN, args, { cwd: SCRAPER_DIR, windowsHide: true })
  job.proc = proc
  const append = (buf) => {
    job.log += buf.toString()
    if (job.log.length > LOG_CAP) job.log = job.log.slice(-LOG_CAP)
  }
  proc.stdout.on('data', append)
  proc.stderr.on('data', append)
  proc.on('error', (err) => {
    job.status = 'error'
    job.error = err.code === 'ENOENT'
      ? `Could not run "${PYTHON_BIN}". Install Python and the scraper deps, or set PYTHON_BIN.`
      : err.message
    job.log += `\n[error] ${job.error}\n`
  })
  proc.on('close', async (code) => {
    job.proc = null
    if (job.status === 'error') return pruneJobs()
    if (code !== 0) {
      job.status = 'error'
      job.error = `Scraper exited with code ${code}`
      return pruneJobs()
    }
    job.log += '\nImporting into the database…\n'
    try {
      job.summary = await ingestEvents(jsonPath)
      job.log += `Imported: ${job.summary.created} new, ${job.summary.updated} updated ` +
        `(${job.summary.events} events, ${job.summary.categories} categories).\n`
      job.status = 'done'
    } catch (err) {
      job.status = 'error'
      job.error = 'Import failed: ' + err.message
      job.log += `\n[import error] ${err.message}\n`
    }
    pruneJobs()
  })
  return job
}

export const scraperRouter = express.Router()
scraperRouter.use(requireAuth)

// Sync events from Ticketing Box Office into the database.
scraperRouter.post('/events', (req, res) => {
  const job = startEventsJob(req.body || {})
  res.status(201).json(jobView(job))
})

// Start a scrape. Returns the initial job view; the client polls GET /:id.
scraperRouter.post('/', (req, res) => {
  const b = req.body || {}
  const url = String(b.url || '').trim()
  if (!/^https?:\/\/.+/i.test(url)) {
    return res.status(400).json({ error: 'A valid http(s) URL is required' })
  }
  const mode = ['auto', 'single', 'crawl'].includes(b.mode) ? b.mode : 'auto'
  const job = startJob({
    url,
    mode,
    formats: b.formats,
    downloadImages: Boolean(b.downloadImages),
    render: Boolean(b.render),
    ignoreRobots: Boolean(b.ignoreRobots),
    allPages: b.allPages === undefined ? true : Boolean(b.allPages),
    limit: b.limit,
    workers: b.workers,
    delay: b.delay,
  })
  res.status(201).json(jobView(job))
})

scraperRouter.get('/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  res.json(jobView(job))
})

// Download one export file (top-level only; no path traversal).
scraperRouter.get('/:id/files/:name', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  const outDir = path.join(SCRAPE_DIR, job.id)
  const target = path.resolve(outDir, req.params.name)
  if (target !== path.join(outDir, path.basename(req.params.name))) {
    return res.status(400).json({ error: 'Invalid file path' })
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return res.status(404).json({ error: 'File not found' })
  }
  res.download(target)
})

// Download the whole run (exports + images) as a zip.
scraperRouter.get('/:id/zip', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  const outDir = path.join(SCRAPE_DIR, job.id)
  if (!fs.existsSync(outDir)) return res.status(404).json({ error: 'Nothing to download' })

  res.attachment(`scrape-${job.id}.zip`)
  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.on('error', (err) => res.status(500).end(String(err)))
  archive.pipe(res)
  archive.directory(outDir, false)
  archive.finalize()
})
