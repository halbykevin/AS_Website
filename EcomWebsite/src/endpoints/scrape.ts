/**
 * Admin-only scrape + import endpoints (mirrors AS_Website's server/src/scraper.js).
 *
 *   POST /api/scrape       → start a job: spawn WebScarping/scrape.py, then run the
 *                            importer on its products.json. Returns the job view.
 *   GET  /api/scrape/:id   → poll status / log / summary.
 *
 * Jobs are tracked in memory (lost on restart), like the AS_Website tool.
 * Runs inside the Payload process, so it can spawn Python and use the Local API.
 */
import type { Endpoint, Payload } from 'payload'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'

import { importProducts, type ScrapedProduct, type ImportSummary } from '@/lib/scraper/importProducts'

const SCRAPER_DIR = path.resolve(
  process.env.SCRAPER_DIR || path.join(process.cwd(), '..', 'WebScarping'),
)
const SCRAPE_DIR = path.resolve(process.env.SCRAPE_DIR || path.join(process.cwd(), 'scrapes'))
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')

const LOG_CAP = 200_000
const KEEP_JOBS = 20

fs.mkdirSync(SCRAPE_DIR, { recursive: true })

type Job = {
  id: string
  status: 'running' | 'done' | 'error'
  log: string
  error: string | null
  createdAt: number
  summary: ImportSummary | null
}

const jobs = new Map<string, Job>()

const num = (v: unknown, dflt: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : dflt
}

const jobView = (j: Job) => ({
  id: j.id,
  status: j.status,
  log: j.log,
  error: j.error,
  createdAt: j.createdAt,
  summary: j.summary,
})

function pruneJobs() {
  const finished = [...jobs.values()]
    .filter((j) => j.status !== 'running')
    .sort((a, b) => b.createdAt - a.createdAt)
  for (const job of finished.slice(KEEP_JOBS)) jobs.delete(job.id)
}

function buildArgs(opts: Record<string, unknown>, jsonPath: string): string[] {
  const url = String(opts.url || '')
  const mode =
    opts.mode === 'single'
      ? '--url'
      : opts.mode === 'auto'
        ? '--auto'
        : opts.mode === 'site'
          ? '--site'
          : '--crawl'
  const outDir = path.dirname(jsonPath)
  const args = [
    'scrape.py',
    mode,
    url,
    '--out',
    outDir,
    '--name',
    'products',
    '--format',
    'json',
    '--delay',
    String(Math.max(0, num(opts.delay, 0.1))),
    '--workers',
    String(Math.min(32, Math.max(1, Math.floor(num(opts.workers, 16))))),
  ]
  const limit = Math.floor(num(opts.limit, 0))
  if (limit > 0) args.push('--limit', String(limit))
  if (opts.render) args.push('--render')
  if (opts.ignoreRobots) args.push('--no-robots')
  if (opts.allPages === false) args.push('--no-pagination')
  return args
}

function startJob(payload: Payload, opts: Record<string, unknown>): Job {
  const id = randomUUID()
  const outDir = path.join(SCRAPE_DIR, id)
  fs.mkdirSync(outDir, { recursive: true })
  const jsonPath = path.join(outDir, 'products.json')

  const job: Job = {
    id,
    status: 'running',
    log: '',
    error: null,
    createdAt: Date.now(),
    summary: null,
  }
  jobs.set(id, job)

  const append = (msg: string) => {
    job.log += msg.endsWith('\n') ? msg : msg + '\n'
    if (job.log.length > LOG_CAP) job.log = job.log.slice(-LOG_CAP)
  }

  const args = buildArgs(opts, jsonPath)
  append(`$ ${PYTHON_BIN} ${args.join(' ')}`)

  const proc = spawn(PYTHON_BIN, args, {
    cwd: SCRAPER_DIR,
    windowsHide: true,
    // PYTHONUNBUFFERED makes the scraper stream its log lines live instead of
    // buffering them into big chunks.
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
  })

  proc.stdout.on('data', (b) => append(b.toString()))
  proc.stderr.on('data', (b) => append(b.toString()))

  proc.on('error', (err: NodeJS.ErrnoException) => {
    job.status = 'error'
    job.error =
      err.code === 'ENOENT'
        ? `Could not run "${PYTHON_BIN}". Install Python + scraper deps, or set PYTHON_BIN.`
        : err.message
    append(`[error] ${job.error}`)
  })

  proc.on('close', async (code) => {
    if (job.status === 'error') return pruneJobs()
    if (code !== 0) {
      job.status = 'error'
      job.error = `Scraper exited with code ${code}`
      return pruneJobs()
    }
    try {
      if (!fs.existsSync(jsonPath)) throw new Error('scraper produced no products.json')
      const products = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as ScrapedProduct[]
      append(`\nImporting ${products.length} product(s) into the catalog…`)
      job.summary = await importProducts(payload, products, {
        limit: Math.floor(num(opts.limit, 0)),
        log: append,
      })
      append(
        `\nDone: ${job.summary.created} created, ${job.summary.updated} updated, ` +
          `${job.summary.skipped} skipped, ${job.summary.categories} new categories, ` +
          `${job.summary.images} images.`,
      )
      job.status = 'done'
    } catch (err) {
      job.status = 'error'
      job.error = 'Import failed: ' + (err as Error).message
      append(`[import error] ${(err as Error).message}`)
    }
    pruneJobs()
  })

  return job
}

const isAdmin = (req: { user?: { roles?: string[] } | null }) =>
  Boolean(req.user && Array.isArray(req.user.roles) && req.user.roles.includes('admin'))

export const scrapeEndpoints: Endpoint[] = [
  {
    path: '/scrape',
    method: 'post',
    handler: async (req) => {
      if (!isAdmin(req)) return Response.json({ error: 'Forbidden' }, { status: 403 })
      let body: Record<string, unknown> = {}
      try {
        body = ((await req.json?.()) as Record<string, unknown>) || {}
      } catch {
        body = {}
      }
      const url = String(body.url || '').trim()
      if (!/^https?:\/\/.+/i.test(url)) {
        return Response.json({ error: 'A valid http(s) URL is required' }, { status: 400 })
      }
      const job = startJob(req.payload, {
        url,
        mode: ['auto', 'single', 'crawl', 'site'].includes(String(body.mode)) ? body.mode : 'crawl',
        limit: body.limit,
        allPages: body.allPages === undefined ? true : Boolean(body.allPages),
        render: Boolean(body.render),
        ignoreRobots: Boolean(body.ignoreRobots),
        delay: body.delay,
        workers: body.workers,
      })
      return Response.json(jobView(job), { status: 201 })
    },
  },
  {
    path: '/scrape/:id',
    method: 'get',
    handler: async (req) => {
      if (!isAdmin(req)) return Response.json({ error: 'Forbidden' }, { status: 403 })
      const id = (req.routeParams?.id as string) || ''
      const job = jobs.get(id)
      if (!job) return Response.json({ error: 'Job not found' }, { status: 404 })
      return Response.json(jobView(job))
    },
  },
]
