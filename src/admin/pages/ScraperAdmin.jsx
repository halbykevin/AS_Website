import { useEffect, useRef, useState } from 'react'
import { adminApi, downloadScrapeFile, downloadScrapeZip } from '../../lib/api.js'
import { Card, Field, TextInput, Select, Toggle, Button, Banner, PageHeader } from '../ui.jsx'

const FORMATS = [
  { key: 'json', label: 'JSON' },
  { key: 'csv', label: 'CSV' },
  { key: 'xlsx', label: 'Excel' },
  { key: 'html', label: 'HTML page' },
]

const fmtSize = (n) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function ScraperAdmin() {
  const [mode, setMode] = useState('products') // 'products' | 'events'
  const [form, setForm] = useState({
    url: '',
    mode: 'auto',
    downloadImages: false,
    formats: ['json', 'csv', 'xlsx', 'html'],
    render: false,
    allPages: true,
    ignoreRobots: false,
    limit: 0,
    workers: 8,
    delay: 0.2,
  })
  const [job, setJob] = useState(null)
  const [msg, setMsg] = useState(null)
  const pollRef = useRef(null)

  const running = job?.status === 'running'

  useEffect(() => {
    if (!job || job.status !== 'running') return
    pollRef.current = setInterval(async () => {
      try {
        setJob(await adminApi.getScrape(job.id))
      } catch {
        /* keep last state; next tick retries */
      }
    }, 1500)
    return () => clearInterval(pollRef.current)
  }, [job?.id, job?.status])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const toggleFormat = (key) =>
    set({
      formats: form.formats.includes(key)
        ? form.formats.filter((f) => f !== key)
        : [...form.formats, key],
    })

  async function startProducts() {
    setMsg(null)
    const url = form.url.trim()
    if (!/^https?:\/\/.+/i.test(url)) {
      setMsg({ kind: 'error', text: 'Enter a full URL starting with http:// or https://' })
      return
    }
    if (!form.formats.length) {
      setMsg({ kind: 'error', text: 'Pick at least one export format.' })
      return
    }
    try {
      setJob(await adminApi.startScrape({ ...form, url }))
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Could not start the scrape.' })
    }
  }

  async function startEvents() {
    setMsg(null)
    try {
      setJob(await adminApi.startEventsScrape())
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Could not start the events sync.' })
    }
  }

  async function download(name) {
    try {
      await downloadScrapeFile(job.id, name)
    } catch {
      setMsg({ kind: 'error', text: `Could not download ${name}.` })
    }
  }
  async function downloadZip() {
    try {
      await downloadScrapeZip(job.id)
    } catch {
      setMsg({ kind: 'error', text: 'Could not download the zip.' })
    }
  }

  const switchMode = (m) => {
    if (running) return
    setMode(m)
    setMsg(null)
    setJob(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Web Scraper"
        description="Two tools: pull product data from any e-commerce page, or sync events from Ticketing Box Office straight into your site."
      />

      {/* Mode switch */}
      <div className="flex flex-wrap gap-2">
        <Button variant={mode === 'products' ? 'primary' : 'ghost'} onClick={() => switchMode('products')}>
          E-commerce products
        </Button>
        <Button variant={mode === 'events' ? 'primary' : 'ghost'} onClick={() => switchMode('events')}>
          Events — Ticketing Box Office
        </Button>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {mode === 'products' ? (
        <Card title="Scrape products">
          <div className="space-y-5">
            <Field
              label="Product or category page URL"
              hint="A single product page, or a category/collection page to crawl."
            >
              <TextInput
                type="url"
                placeholder="https://store.example.com/products/widget"
                value={form.url}
                onChange={(e) => set({ url: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mode">
                <Select value={form.mode} onChange={(e) => set({ mode: e.target.value })}>
                  <option value="auto">Auto-detect (recommended)</option>
                  <option value="single">Single product</option>
                  <option value="crawl">Crawl category page</option>
                </Select>
              </Field>
              <Field label="Images">
                <Select
                  value={form.downloadImages ? 'download' : 'links'}
                  onChange={(e) => set({ downloadImages: e.target.value === 'download' })}
                >
                  <option value="links">Links only (in export)</option>
                  <option value="download">Download image files</option>
                </Select>
              </Field>
            </div>

            <Field label="Export formats">
              <div className="flex flex-wrap gap-4 pt-1">
                {FORMATS.map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-sm text-as-charcoal">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-as-red"
                      checked={form.formats.includes(f.key)}
                      onChange={() => toggleFormat(f.key)}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Max products" hint="0 = no limit (crawl).">
                <TextInput type="number" min="0" value={form.limit} onChange={(e) => set({ limit: e.target.value })} />
              </Field>
              <Field label="Speed (parallel fetches)">
                <TextInput type="number" min="1" max="32" value={form.workers} onChange={(e) => set({ workers: e.target.value })} />
              </Field>
              <Field label="Delay between requests (s)">
                <TextInput type="number" min="0" step="0.1" value={form.delay} onChange={(e) => set({ delay: e.target.value })} />
              </Field>
            </div>

            <div className="space-y-3">
              <Toggle
                label="Follow “Next” through all pages"
                description="When crawling a category, page through the whole catalog."
                checked={form.allPages}
                onChange={(v) => set({ allPages: v })}
              />
              <Toggle
                label="JavaScript site"
                description="Use a headless browser for JS-rendered pages (slower; needs Playwright on the server)."
                checked={form.render}
                onChange={(v) => set({ render: v })}
              />
              <Toggle
                label="Ignore robots.txt"
                description="Only enable for sites you own or have permission to scrape."
                checked={form.ignoreRobots}
                onChange={(v) => set({ ignoreRobots: v })}
              />
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={startProducts} disabled={running}>
                {running ? 'Scraping…' : 'Start scraping'}
              </Button>
              {running && <Spinner />}
            </div>
          </div>
        </Card>
      ) : (
        <Card title="Sync events from Ticketing Box Office">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-as-charcoal/70">
              Pulls every current event and its category from{' '}
              <span className="font-semibold">ticketingboxoffice.com</span> into your site — title,
              date(s), venue, description and the booking link. Multi-day events (e.g. a play running
              several nights, or a tournament) are imported as one event with all its dates. Existing
              imported events are updated, not duplicated; your manually-created events are left
              untouched.
            </p>
            <Banner kind="info">
              Categories (Concerts, Theatrical plays, Sports…) are created automatically with their
              tile images. After syncing, review the new events under <strong>Events</strong>.
            </Banner>
            <div className="flex items-center gap-3">
              <Button onClick={startEvents} disabled={running}>
                {running ? 'Syncing…' : 'Sync events now'}
              </Button>
              {running && <Spinner />}
            </div>
          </div>
        </Card>
      )}

      {job && (
        <Card title="Result">
          <div className="space-y-4">
            <div className="text-sm">
              <span className="font-semibold text-as-charcoal">Status: </span>
              <span
                className={
                  job.status === 'done'
                    ? 'text-green-700'
                    : job.status === 'error'
                      ? 'text-as-red'
                      : 'text-as-charcoal/70'
                }
              >
                {job.status}
              </span>
              {job.error && <span className="text-as-red"> — {job.error}</span>}
            </div>

            {/* Events sync summary */}
            {job.kind === 'events' && job.status === 'done' && job.summary && (
              <Banner kind="success">
                Imported {job.summary.created} new and updated {job.summary.updated} event
                {job.summary.updated === 1 ? '' : 's'} ({job.summary.events} total,{' '}
                {job.summary.categories} categories).
              </Banner>
            )}

            {/* Product downloads */}
            {job.kind !== 'events' && job.status === 'done' && (
              <div className="space-y-3">
                {job.files?.length ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {job.files.map((f) => (
                        <button
                          key={f.name}
                          type="button"
                          onClick={() => download(f.name)}
                          className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium text-as-charcoal transition hover:border-as-red/30 hover:text-as-red"
                        >
                          ↓ {f.name}
                          <span className="text-xs text-as-charcoal/45">{fmtSize(f.size)}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <Button variant="ghost" onClick={downloadZip}>
                        Download all (.zip)
                      </Button>
                      {job.imageCount > 0 && (
                        <span className="text-xs text-as-charcoal/55">
                          includes {job.imageCount} downloaded image{job.imageCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-as-charcoal/55">No products were extracted.</p>
                )}
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-as-charcoal/45">Log</p>
              <pre className="max-h-72 overflow-auto rounded-xl bg-[#1e1e1e] p-4 text-xs leading-relaxed text-[#d4d4d4] whitespace-pre-wrap">
                {job.log || 'Starting…'}
              </pre>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-as-charcoal/55">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-as-red/20 border-t-as-red" />
      Working…
    </span>
  )
}
