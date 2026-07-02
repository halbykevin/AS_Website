'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Button, Card, Field, Input, Select, Toggle, Badge } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'

const MODES = [
  { value: 'auto', label: 'Auto-detect (single product or category)' },
  { value: 'crawl', label: 'Crawl a category / listing page' },
  { value: 'single', label: 'Single product page' },
  { value: 'site', label: 'Entire site (all categories)' },
]

export default function ImportPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const logRef = useRef(null)
  const pollRef = useRef(null)

  const [opts, setOpts] = useState({
    url: '',
    mode: 'auto',
    limit: 20,
    workers: 10,
    ignoreRobots: false,
    render: false,
    allPages: false,
  })
  const [job, setJob] = useState(null)
  const running = job?.status === 'running'

  const set = (k, v) => setOpts((o) => ({ ...o, [k]: v }))

  // Auto-scroll the log.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [job?.log])

  // Clean up polling on unmount.
  useEffect(() => () => clearTimeout(pollRef.current), [])

  const poll = async (id) => {
    try {
      const j = await adminApi.getScrape(id)
      setJob(j)
      if (j.status === 'running') {
        pollRef.current = setTimeout(() => poll(id), 1500)
      } else if (j.status === 'done') {
        toast.success('Import complete')
        qc.invalidateQueries({ queryKey: ['admin', 'products'] })
        qc.invalidateQueries({ queryKey: ['admin', 'brands'] })
        qc.invalidateQueries({ queryKey: ['admin', 'categories'] })
      } else if (j.status === 'error') {
        toast.error(j.error || 'Import failed')
      }
    } catch (e) {
      toast.error(e.message)
    }
  }

  const start = async () => {
    if (!/^https?:\/\//i.test(opts.url)) return toast.error('Enter a valid http(s) URL')
    clearTimeout(pollRef.current)
    try {
      const j = await adminApi.startScrape(opts)
      setJob(j)
      if (j.status === 'running') pollRef.current = setTimeout(() => poll(j.id), 1200)
    } catch (e) {
      toast.error(e.message)
    }
  }

  const s = job?.summary

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-as-ink">Import products</h2>
        <p className="mt-1 text-sm text-as-ink/50">
          Scrape an e-commerce page and pull its products, categories, brands and images straight
          into your catalog. Re-running on the same URLs updates rather than duplicates.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Form */}
        <Card className="space-y-4 p-5">
          <Field label="Source URL">
            <Input
              value={opts.url}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://store.example.com/shop"
            />
          </Field>
          <Field label="Mode">
            <Select value={opts.mode} onChange={(e) => set('mode', e.target.value)}>
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Max products" hint="0 = no limit">
              <Input type="number" value={opts.limit} onChange={(e) => set('limit', e.target.value)} />
            </Field>
            <Field label="Parallel fetches">
              <Input type="number" value={opts.workers} onChange={(e) => set('workers', e.target.value)} />
            </Field>
          </div>

          <div className="space-y-3 rounded-xl bg-as-fog/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-as-ink/70">Follow pagination (all pages)</span>
              <Toggle checked={opts.allPages} onChange={(v) => set('allPages', v)} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-as-ink/70">Ignore robots.txt</span>
              <Toggle checked={opts.ignoreRobots} onChange={(v) => set('ignoreRobots', v)} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-as-ink/70">
                JavaScript site (render)
                <span className="ml-1 text-xs text-as-ink/40">needs Playwright</span>
              </span>
              <Toggle checked={opts.render} onChange={(v) => set('render', v)} />
            </div>
          </div>

          <Button onClick={start} disabled={running} className="w-full">
            <Icon name="download" className="h-4 w-4" />
            {running ? 'Importing…' : 'Start import'}
          </Button>
        </Card>

        {/* Status + log */}
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-as-ink/10 px-5 py-3">
            <h3 className="font-bold text-as-ink">Run log</h3>
            {job && (
              <Badge tone={job.status === 'done' ? 'green' : job.status === 'error' ? 'red' : 'amber'}>
                {job.status}
              </Badge>
            )}
          </div>

          {s && (
            <div className="grid grid-cols-3 gap-px border-b border-as-ink/10 bg-as-ink/5 text-center">
              {[
                ['New', s.created],
                ['Updated', s.updated],
                ['Skipped', s.skipped],
                ['Brands', s.brands],
                ['Categories', s.categories],
                ['Scraped', s.products],
              ].map(([label, val]) => (
                <div key={label} className="bg-white py-3">
                  <p className="text-xl font-bold text-as-ink">{val}</p>
                  <p className="text-xs text-as-ink/45">{label}</p>
                </div>
              ))}
            </div>
          )}

          <pre
            ref={logRef}
            className="m-0 h-72 flex-1 overflow-auto bg-as-ink p-4 font-mono text-xs leading-relaxed text-white/80"
          >
            {job?.log || 'The scraper output will stream here…'}
            {job?.error ? `\n\nError: ${job.error}` : ''}
          </pre>

          {job?.status === 'done' && (
            <div className="border-t border-as-ink/10 p-3">
              <Link href="/admin/products" className="text-sm font-medium text-as-red hover:underline">
                View imported products →
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
