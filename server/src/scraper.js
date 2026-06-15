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
    status: job.status,
    log: job.log,
    error: job.error,
    createdAt: job.createdAt,
    files: job.files,
    imageCount: job.imageCount,
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

export const scraperRouter = express.Router()
scraperRouter.use(requireAuth)

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
