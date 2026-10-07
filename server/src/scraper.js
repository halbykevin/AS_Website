// Web scraper bridge. Two jobs run out of ../../WebScarping as subprocesses:
//   - the e-commerce product scraper (scrape.py), whose output the admin
//     downloads as files or a zip;
//   - the events sync (events_sync.py), which pulls every ticketing partner's
//     listings and imports them straight into Postgres.
// Each run gets its own folder under SCRAPE_DIR; the admin UI polls for
// status/log while the job runs.

import express from 'express'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { ZipArchive } from 'archiver'
import { requireAuth } from './auth.js'
import { query } from './db.js'
import { SCHEDULE_TZ, isRunAt, nextRunAfter, startSchedule } from './eventSyncSchedule.js'

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
    triggeredBy: job.triggeredBy,
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
// Events sync: run events_sync.py across every ticketing partner, then ingest
// the JSON it writes into the events + categories tables.
//
// The import is idempotent — every event is keyed on (source, external_id), so
// re-running updates rather than duplicates, and hand-made events (source = '')
// are never touched. What the Python side already decided is honoured here:
// a multi-night run arrives as one event with many `dates`, a cross-listed
// event arrives once, and the rows an earlier run created for the listings that
// have since been folded away, expired or delisted are removed (see cleanup at
// the bottom of ingestEvents).
// ---------------------------------------------------------------------------
const slugify = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const makeExcerpt = (desc) => {
  const line = String(desc || '').replace(/\s+/g, ' ').trim()
  return line.length > 140 ? line.slice(0, 137) + '…' : line
}

// Every source key the scraper knows about. Kept here (rather than derived from
// the run) so a source that failed this time still has its rows left alone.
const EVENT_SOURCES = ['ticketingboxoffice', 'tickit', 'ihjoz', 'antoineticketing']

async function uniqueSlug(base, extId) {
  const slug = base || 'event'
  const { rows } = await query('SELECT 1 FROM events WHERE slug=$1', [slug])
  if (!rows[0]) return slug
  return `${slug}-${String(extId).replace(/[^a-z0-9]/gi, '') || Date.now()}`
}

async function upsertCategories(cats) {
  // The slug is the identity; the name belongs to the admin. A category renamed
  // in the dashboard keeps its name across syncs, and its tile image is only
  // filled in when we don't have one yet.
  let sort = 0
  for (const c of cats) {
    const slug = c.slug || slugify(c.name)
    if (!slug) continue
    await query(
      `INSERT INTO categories (name, slug, image_url, sort, visible)
       VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (slug) DO UPDATE SET
         image_url = CASE WHEN categories.image_url = '' THEN EXCLUDED.image_url
                          ELSE categories.image_url END`,
      [c.name || slug, slug, c.image || '', sort++]
    )
  }
  const { rows } = await query('SELECT id, slug FROM categories')
  return new Map(rows.map((r) => [r.slug, r.id]))
}

// A category with nothing filed under it is a dead tile on both the website and
// the ticketing platform, so a complete sync hides it — and un-hides it when
// events come back. `auto_hidden_at` is what makes a hide OURS, and it is the
// only thing standing between this and someone's manual decision:
//
//   hidden + stamped  = the sync hid it     -> restore when events return
//   hidden + no stamp = a person hid it     -> never touch
//   visible + stamped = a person un-hid it  -> never touch again
//
// "Empty" counts EVERY event, hand-made ones included — a category holding only
// events an admin typed in must not disappear because no ticketing site
// happened to use it.
async function syncCategoryVisibility() {
  const hidden = await query(
    `UPDATE categories c SET visible = false, auto_hidden_at = now()
      WHERE c.visible = true
        AND c.auto_hidden_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM events e WHERE e.category_id = c.id)
      RETURNING name`
  )
  const shown = await query(
    `UPDATE categories c SET visible = true, auto_hidden_at = NULL
      WHERE c.visible = false
        AND c.auto_hidden_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM events e WHERE e.category_id = c.id)
      RETURNING name`
  )
  return { hidden: hidden.rows.map((r) => r.name), shown: shown.rows.map((r) => r.name) }
}

async function ingestEvents(jsonPath, { prune = true } = {}) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const cats = Array.isArray(data.categories) ? data.categories : []
  const events = Array.isArray(data.events) ? data.events : []
  const sources = data.sources || {}
  const complete = Boolean(data.complete)

  const catBySlug = await upsertCategories(cats)

  let created = 0
  let updated = 0
  // (source, external_id) pairs this run vouches for — everything else that
  // came from a source we just synced is a candidate for removal.
  const keep = new Map(EVENT_SOURCES.map((k) => [k, new Set()]))

  for (const e of events) {
    const source = String(e.source || '')
    if (!EVENT_SOURCES.includes(source)) continue
    const extId = String(e.externalId || '')
    if (!extId) continue
    keep.get(source).add(extId)

    const categoryId = catBySlug.get(slugify(e.categoryName || '')) || null
    const v = [
      e.title || '', e.primaryDate || null, e.primaryTime || '', e.venue || '', e.city || '',
      e.imageUrl || '', e.ticketUrl || '', e.excerpt || makeExcerpt(e.description),
      e.description || '', categoryId, JSON.stringify(Array.isArray(e.dates) ? e.dates : []),
    ]

    // Match on any of the run's listing ids, not just the one we key it on now:
    // when the first night of a run sells out and the site retires it, the run
    // gets a new primary id, and this is what stops that becoming a second row.
    const ids = [extId, ...(Array.isArray(e.mergedIds) ? e.mergedIds.map(String) : [])]
    const existing = await query(
      'SELECT id FROM events WHERE source=$1 AND external_id = ANY($2) ORDER BY id LIMIT 1',
      [source, ids]
    )
    if (existing.rows[0]) {
      await query(
        `UPDATE events SET title=$1, date=$2, time=$3, venue=$4, city=$5, image_url=$6,
           ticket_url=$7, excerpt=$8, description=$9, category_id=$10, dates=$11, external_id=$12
         WHERE id=$13`,
        [...v, extId, existing.rows[0].id]
      )
      updated++
    } else {
      const slug = await uniqueSlug(slugify(e.title), extId)
      await query(
        `INSERT INTO events
           (title, slug, date, time, venue, city, image_url, ticket_url, status,
            excerpt, description, sort, category_id, dates, source, external_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10,0,$11,$12,$13,$14)`,
        [v[0], slug, v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], source, extId]
      )
      created++
    }
  }

  // ---- Clean-up -----------------------------------------------------------
  // Rows an earlier run created that this run says should no longer stand on
  // their own: a night now folded into a run, a listing that turned out to be a
  // cross-listing of another site's, or an event that has already happened.
  // These are always safe to drop — they are named explicitly, and manual
  // events (source = '') can never appear in the list.
  const removeIds = []
  for (const entry of [...(data.duplicates || []), ...(data.past || [])]) {
    const source = String(entry.source || '')
    if (!EVENT_SOURCES.includes(source)) continue
    const ids = [String(entry.externalId || ''),
                 ...(Array.isArray(entry.mergedIds) ? entry.mergedIds.map(String) : [])]
      .filter(Boolean)
      .filter((id) => !keep.get(source).has(id))
    if (ids.length) removeIds.push([source, ids])
  }
  for (const e of events) {
    const source = String(e.source || '')
    if (!EVENT_SOURCES.includes(source)) continue
    const folded = (Array.isArray(e.mergedIds) ? e.mergedIds.map(String) : [])
      .filter((id) => id && !keep.get(source).has(id))
    if (folded.length) removeIds.push([source, folded])
  }

  let removed = 0
  for (const [source, ids] of removeIds) {
    const { rowCount } = await query(
      'DELETE FROM events WHERE source=$1 AND external_id = ANY($2)', [source, ids]
    )
    removed += rowCount
  }

  // Everything else the source has stopped listing — plus everything belonging
  // to a site this run did not ask for. Which sites were selected IS the site's
  // event feed: a run that leaves another site's events standing would put back
  // the cross-listings this one just resolved (the same night is on two sites,
  // and only a run covering both can tell). A source that was asked for and
  // failed is the one thing left untouched — a half-finished crawl looks
  // exactly like a site emptying its calendar.
  let delisted = 0
  const prunable = prune && complete
    ? EVENT_SOURCES.filter((k) => !sources[k] || (sources[k].ok && keep.get(k).size > 0))
    : []
  for (const source of prunable) {
    const { rowCount } = await query(
      `DELETE FROM events WHERE source=$1 AND external_id <> '' AND NOT (external_id = ANY($2))`,
      [source, [...keep.get(source)]]
    )
    delisted += rowCount
  }

  // Only when the run was complete: on a partial crawl a category looks empty
  // simply because the site that fills it did not answer.
  const categoryVisibility = prunable.length
    ? await syncCategoryVisibility()
    : { hidden: [], shown: [] }

  return {
    categories: cats.length,
    categoryVisibility,
    events: events.length,
    created,
    updated,
    removed,
    delisted,
    pruned: prunable,
    complete,
    sources,
    duplicates: (data.duplicates || []).length,
    past: (data.past || []).length,
    runsMerged: Number(data.runsMerged) || 0,
  }
}

// ---- Run history ------------------------------------------------------------
// Every events sync is written to event_sync_runs as it starts and again when it
// ends, so the admin can see when the last one ran and how it went — including
// the morning runs nobody watched, and across API restarts (the in-memory
// `jobs` above are only for following a run live).
const KEEP_RUNS = 60
const RUN_LOG_CAP = 64_000

function recordRunStart(job, options) {
  return query(
    'INSERT INTO event_sync_runs (id, triggered_by, options) VALUES ($1, $2, $3)',
    [job.id, job.triggeredBy, JSON.stringify(options)]
  ).catch((err) => console.warn(`[events-sync] could not record run ${job.id}: ${err.message}`))
}

async function recordRunEnd(job) {
  if (job.recorded) return
  job.recorded = true
  try {
    await job.recording // the INSERT, which a fast failure could otherwise overtake
    await query(
      `UPDATE event_sync_runs SET status = $2, summary = $3, error = $4, log = $5, finished_at = now()
        WHERE id = $1`,
      [job.id, job.status, job.summary ? JSON.stringify(job.summary) : null, job.error,
       job.log.slice(-RUN_LOG_CAP)]
    )
    await query(
      `DELETE FROM event_sync_runs
        WHERE id IN (SELECT id FROM event_sync_runs ORDER BY started_at DESC OFFSET $1)`,
      [KEEP_RUNS]
    )
  } catch (err) {
    console.warn(`[events-sync] could not record the end of run ${job.id}: ${err.message}`)
  }
}

// Per-site results from a run that imported nothing, so its history row can
// still say which sites failed and why.
function readSourceReport(jsonPath) {
  try {
    const { sources } = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    return sources && typeof sources === 'object' ? sources : null
  } catch {
    return null
  }
}

function runningEventsJob() {
  for (const job of jobs.values()) {
    if (job.kind === 'events' && job.status === 'running') return job
  }
  return null
}

function startEventsJob(opts, triggeredBy = 'manual') {
  const id = randomUUID()
  const outDir = path.join(SCRAPE_DIR, id)
  fs.mkdirSync(outDir, { recursive: true })
  const jsonPath = path.join(outDir, 'events.json')

  const job = {
    id, kind: 'events', triggeredBy, status: 'running', log: '', error: null,
    createdAt: Date.now(), files: [], imageCount: 0, summary: null, proc: null,
  }
  jobs.set(id, job)

  const delay = Math.max(0, num(opts.delay, 0.3))
  const args = ['events_sync.py', '--out', jsonPath, '--delay', String(delay)]

  const sources = (Array.isArray(opts.sources) ? opts.sources : [])
    .map(String)
    .filter((s) => EVENT_SOURCES.includes(s))
  if (sources.length && sources.length < EVENT_SOURCES.length) {
    args.push('--sources', sources.join(','))
  }
  // '' means every country; anything else is passed through as the filter.
  const country = opts.country === undefined ? 'Lebanon' : String(opts.country)
  args.push('--country', country)
  if (Math.floor(num(opts.limit, 0)) > 0) args.push('--limit', String(Math.floor(opts.limit)))
  if (opts.includePast) args.push('--include-past')
  const prune = opts.prune !== false

  job.recording = recordRunStart(job, {
    sources: sources.length ? sources : EVENT_SOURCES, country, prune,
  })
  const finish = () => {
    pruneJobs()
    recordRunEnd(job)
  }

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
    if (!proc.pid) recordRunEnd(job) // never started, so 'close' may not follow
  })
  proc.on('close', async (code) => {
    job.proc = null
    if (job.status === 'error') return finish()
    // 3 = at least one site answered but not all of them. Worth importing (the
    // JSON says the run was partial, so nothing gets pruned), not worth failing.
    if (code !== 0 && code !== 3) {
      job.status = 'error'
      job.error = code === 1
        ? 'No events could be scraped — every source failed. Nothing was changed.'
        : `Scraper exited with code ${code}`
      const report = readSourceReport(jsonPath)
      if (report) job.summary = { sources: report, complete: false }
      return finish()
    }
    job.log += '\nImporting into the database…\n'
    try {
      const s = await ingestEvents(jsonPath, { prune })
      job.summary = s
      job.log +=
        `Imported: ${s.created} new, ${s.updated} updated ` +
        `(${s.events} events, ${s.categories} categories).\n` +
        `Cleared: ${s.removed} folded/duplicate/past, ${s.delisted} no longer listed` +
        (s.complete ? '' : ' (partial run — nothing was pruned)') + '.\n' +
        (s.categoryVisibility?.hidden.length
          ? `Hid ${s.categoryVisibility.hidden.length} empty categories: ` + `${s.categoryVisibility.hidden.join(', ')}.\n`
          : '') +
        (s.categoryVisibility?.shown.length
          ? `Brought back: ${s.categoryVisibility.shown.join(', ')} (events again).\n`
          : '')
      job.status = 'done'
    } catch (err) {
      job.status = 'error'
      job.error = 'Import failed: ' + err.message
      job.log += `\n[import error] ${err.message}\n`
    }
    finish()
  })
  return job
}

// ---- The daily sync -----------------------------------------------------------
const scheduleJson = (r) => ({
  enabled: r.enabled,
  runAt: r.run_at,
  sources: EVENT_SOURCES.filter((k) => !(r.skipped_sources || []).includes(k)),
  country: r.country,
  prune: r.prune,
  nextRunAt: r.enabled ? r.next_run_at : null,
  timezone: SCHEDULE_TZ,
})

const runJson = (r) => ({
  id: r.id,
  triggeredBy: r.triggered_by,
  status: r.status,
  options: r.options,
  summary: r.summary,
  error: r.error,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  ...(r.log === undefined ? {} : { log: r.log }),
})

/** Call once at startup: closes out what the last process left open, then starts the daily run. */
export function startEventsSchedule() {
  // finished_at stays empty: when it stopped is unknown, and the time of this
  // restart would read as a duration.
  query(
    `UPDATE event_sync_runs
        SET status = 'error',
            error = 'Interrupted — the API restarted while this sync was running.'
      WHERE status = 'running'`
  ).catch(() => {}) // table not migrated yet: the ticker says so once

  startSchedule((s) => {
    if (runningEventsJob()) {
      console.log('[events-sync] daily sync skipped — a sync was already running')
      return
    }
    const skipped = Array.isArray(s.skipped_sources) ? s.skipped_sources : []
    const sources = EVENT_SOURCES.filter((k) => !skipped.includes(k))
    if (!sources.length) return // the admin refuses this; an empty list would mean "every site"
    startEventsJob({ sources, country: s.country, prune: s.prune }, 'schedule')
    console.log(`[events-sync] daily sync started (${sources.join(', ')})`)
  })
}

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export const scraperRouter = express.Router()
scraperRouter.use(requireAuth)

// Sync events from the ticketing partners into the database. The body may narrow
// the run: { sources: ['tickit'], country: 'Lebanon', limit, delay, prune,
// includePast } — all optional, defaults are every source, Lebanon, prune on.
scraperRouter.post('/events', (req, res) => {
  // One at a time: two imports running together race to insert the same new
  // events. Hand back the one already going so the page can follow it.
  const running = runningEventsJob()
  if (running) return res.json({ ...jobView(running), alreadyRunning: true })
  const job = startEventsJob(req.body || {})
  res.status(201).json(jobView(job))
})

// The page's opening state: the saved settings, and a sync already under way (a
// morning run, or one started from another tab) so the page can follow it.
scraperRouter.get('/events/status', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM event_sync_schedule WHERE id = 1')
  if (!rows[0]) return res.status(500).json({ error: 'Run the migration first (npm run migrate).' })
  const running = runningEventsJob()
  res.json({ schedule: scheduleJson(rows[0]), running: running ? jobView(running) : null })
}))

// Save the sync's settings — the sites, country and pruning every run uses, and
// the daily run. { enabled, runAt: 'HH:MM', sources: [...], country, prune }
scraperRouter.put('/events/schedule', ah(async (req, res) => {
  const b = req.body || {}
  const sources = (Array.isArray(b.sources) ? b.sources : [])
    .map(String)
    .filter((s) => EVENT_SOURCES.includes(s))
  if (!sources.length) return res.status(400).json({ error: 'Pick at least one site to sync from.' })
  const runAt = String(b.runAt || '07:00')
  if (!isRunAt(runAt)) return res.status(400).json({ error: 'The time must be HH:MM, e.g. 07:00.' })
  const enabled = Boolean(b.enabled)
  // The clock is only reset when the daily run itself changes: ticking a site at
  // 07:00:30 must not push a run that is due this minute to tomorrow.
  const { rows } = await query(
    `UPDATE event_sync_schedule
        SET enabled = $1, run_at = $2, skipped_sources = $3, country = $4, prune = $5,
            next_run_at = CASE
              WHEN NOT $1 THEN NULL
              WHEN enabled AND run_at = $2 AND next_run_at IS NOT NULL THEN next_run_at
              ELSE $6::timestamptz END,
            updated_at = now()
      WHERE id = 1
      RETURNING *`,
    [enabled, runAt, JSON.stringify(EVENT_SOURCES.filter((k) => !sources.includes(k))),
     b.country === undefined ? 'Lebanon' : String(b.country).trim().slice(0, 60),
     b.prune !== false, nextRunAfter(runAt)]
  )
  if (!rows[0]) return res.status(500).json({ error: 'Run the migration first (npm run migrate).' })
  res.json(scheduleJson(rows[0]))
}))

// The history, newest first — without the logs, which are fetched one at a time.
scraperRouter.get('/events/runs', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT id, triggered_by, status, options, summary, error, started_at, finished_at
       FROM event_sync_runs ORDER BY started_at DESC LIMIT $1`,
    [KEEP_RUNS]
  )
  res.json(rows.map(runJson))
}))

scraperRouter.get('/events/runs/:id', ah(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'Run not found' })
  const { rows } = await query('SELECT * FROM event_sync_runs WHERE id = $1', [req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Run not found' })
  res.json(runJson(rows[0]))
}))

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
  const archive = new ZipArchive({ zlib: { level: 9 } })
  archive.on('error', (err) => res.status(500).end(String(err)))
  archive.pipe(res)
  archive.directory(outDir, false)
  archive.finalize()
})
