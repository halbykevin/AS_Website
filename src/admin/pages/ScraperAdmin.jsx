import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Button, Banner, PageHeader } from '../ui.jsx'

export default function ScraperAdmin() {
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

  async function startEvents() {
    setMsg(null)
    try {
      setJob(await adminApi.startEventsScrape())
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Could not start the events sync.' })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Web Scraper"
        description="Sync events from Ticketing Box Office straight into your site."
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

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

            {job.status === 'done' && job.summary && (
              <Banner kind="success">
                Imported {job.summary.created} new and updated {job.summary.updated} event
                {job.summary.updated === 1 ? '' : 's'} ({job.summary.events} total,{' '}
                {job.summary.categories} categories).
              </Banner>
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
