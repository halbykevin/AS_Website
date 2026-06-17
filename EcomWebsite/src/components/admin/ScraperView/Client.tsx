'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@payloadcms/ui'

const fmtDuration = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

type JobView = {
  id: string
  status: 'running' | 'done' | 'error'
  log: string
  error: string | null
  summary: {
    total: number
    created: number
    updated: number
    skipped: number
    categories: number
    images: number
  } | null
}

const apiBase = () => {
  // Same-origin admin → API lives under /api.
  return ''
}

export const ScraperClient: React.FC = () => {
  const [url, setUrl] = useState('https://pacmax.me')
  const [mode, setMode] = useState<'site' | 'crawl' | 'single' | 'auto'>('site')
  const [limit, setLimit] = useState('0')
  const [running, setRunning] = useState(false)
  const [job, setJob] = useState<JobView | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const logRef = useRef<HTMLPreElement>(null)
  const startedAt = useRef(0)

  // Tick a live elapsed-time counter while a sync is running.
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [running])

  const poll = useCallback(async (id: string) => {
    while (true) {
      await new Promise((r) => setTimeout(r, 1500))
      const res = await fetch(`${apiBase()}/api/scrape/${id}`, { credentials: 'include' })
      if (!res.ok) {
        setErr(`Poll failed (${res.status})`)
        break
      }
      const j: JobView = await res.json()
      setJob(j)
      requestAnimationFrame(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      })
      if (j.status !== 'running') break
    }
  }, [])

  const start = useCallback(async () => {
    setErr(null)
    setJob(null)
    startedAt.current = Date.now()
    setElapsed(0)
    setRunning(true)
    try {
      const res = await fetch(`${apiBase()}/api/scrape`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode, limit: Number(limit) || 0 }),
      })
      const j = await res.json()
      if (!res.ok) {
        setErr(j?.error || `Request failed (${res.status})`)
        return
      }
      setJob(j)
      await poll(j.id)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setRunning(false)
    }
  }, [url, mode, limit, poll])

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ marginBottom: 4 }}>Product Sync</h1>
      <p style={{ color: 'var(--theme-elevation-500)', marginTop: 0 }}>
        Import products into the catalog (with categories, images, and USD prices). Re-running
        updates existing products by SKU, so it&apos;s safe to repeat.
      </p>
      <ul style={{ color: 'var(--theme-elevation-500)', marginTop: 0, fontSize: 13, lineHeight: 1.6 }}>
        <li>
          <strong>Whole site</strong> — enter just the store domain (e.g. <code>https://pacmax.me</code>)
          to pull the entire catalog across all categories. Leave Limit at 0 for everything (this
          can take a while and download many images).
        </li>
        <li>
          <strong>Crawl</strong> — a single category/listing page. <strong>Single</strong> — one
          product page. <strong>Auto-detect</strong> — figure it out from the URL.
        </li>
      </ul>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '20px 0' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>Source URL</span>
          <input
            className="field-type text"
            style={inputStyle}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://store.example.com/?product_cat=..."
            disabled={running}
          />
        </label>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>Mode</span>
            <select
              style={{ ...inputStyle, minWidth: 220 }}
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
              disabled={running}
            >
              <option value="site">Whole site (entire catalog)</option>
              <option value="crawl">Crawl (category/listing page)</option>
              <option value="single">Single product</option>
              <option value="auto">Auto-detect</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>Limit (0 = all)</span>
            <input
              style={{ ...inputStyle, width: 120 }}
              type="number"
              min={0}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              disabled={running}
            />
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Button buttonStyle="primary" disabled={running} onClick={start}>
            {running ? 'Syncing…' : 'Sync now'}
          </Button>
          {(running || elapsed > 0) && (
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--theme-elevation-600)' }}>
              ⏱ {fmtDuration(elapsed)}
              {running && <span style={{ marginLeft: 8 }} className="blink">●</span>}
            </span>
          )}
        </div>
      </div>

      {err && (
        <div style={{ color: 'var(--theme-error-500)', marginBottom: 12 }}>Error: {err}</div>
      )}

      {job && (
        <div>
          <div style={{ marginBottom: 8 }}>
            Status:{' '}
            <strong
              style={{
                color:
                  job.status === 'done'
                    ? 'var(--theme-success-500)'
                    : job.status === 'error'
                      ? 'var(--theme-error-500)'
                      : 'var(--theme-elevation-700)',
              }}
            >
              {job.status}
            </strong>
            {job.summary && (
              <span style={{ marginLeft: 12, color: 'var(--theme-elevation-500)' }}>
                {job.summary.created} created · {job.summary.updated} updated ·{' '}
                {job.summary.skipped} skipped · {job.summary.categories} new categories ·{' '}
                {job.summary.images} images
              </span>
            )}
          </div>
          <pre
            ref={logRef}
            style={{
              background: 'var(--theme-elevation-50)',
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 4,
              padding: 12,
              maxHeight: 360,
              overflow: 'auto',
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}
          >
            {job.log || '…'}
          </pre>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 4,
  background: 'var(--theme-input-bg)',
  color: 'var(--theme-elevation-800)',
  fontSize: 14,
}
