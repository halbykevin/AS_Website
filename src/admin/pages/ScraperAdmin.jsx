import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Button, Banner, PageHeader, Field, Select, TextInput, Toggle } from '../ui.jsx'

// The ticketing partners the sync can pull from. Keys must match EVENT_SOURCES
// in server/src/scraper.js — the API ignores anything it doesn't recognise.
const SOURCE_INFO = {
  ticketingboxoffice: { label: 'Ticketing Box Office', note: 'Concerts, theatre, ballet, sports' },
  tickit: { label: "Tick'it", note: 'Nightlife, parties and comedy' },
  ihjoz: { label: 'ihjoz', note: 'Concerts, festivals, workshops, activities' },
  antoineticketing: { label: 'Antoine Ticketing', note: 'Theatre, music, cinema, kids' },
}
const ALL_SOURCES = Object.keys(SOURCE_INFO)

// Shown when the saved settings can't be read. Nothing is saved from this state,
// so a failed load can never switch the daily sync off.
const DEFAULTS = { sources: ALL_SOURCES, country: 'Lebanon', prune: true, enabled: false, runAt: '07:00' }

// The daily run's clock (SCHEDULE_TZ in server/src/eventSyncSchedule.js). Every
// time on this page is shown in it, whatever the viewer's own zone.
const TZ = 'Asia/Beirut'
const HISTORY_PREVIEW = 10

export default function ScraperAdmin() {
  const [config, setConfig] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [nextRunAt, setNextRunAt] = useState(null)
  const [job, setJob] = useState(null)
  const [runs, setRuns] = useState(null)
  const [openRun, setOpenRun] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [msg, setMsg] = useState(null)
  const dirty = useRef(false)

  const running = job?.status === 'running'

  const loadRuns = useCallback(() => {
    adminApi
      .listEventsSyncRuns()
      .then(setRuns)
      .catch(() => setRuns((cur) => cur || []))
  }, [])

  useEffect(() => {
    let alive = true
    adminApi
      .getEventsSync()
      .then(({ schedule, running }) => {
        if (!alive) return
        const { enabled, runAt, sources, country, prune } = schedule
        setConfig({ enabled, runAt, sources, country, prune })
        setNextRunAt(schedule.nextRunAt)
        setLoaded(true)
        // A morning run (or one started in another tab) is under way: follow it.
        if (running) setJob(running)
      })
      .catch((e) => {
        if (!alive) return
        setConfig(DEFAULTS)
        setMsg({ kind: 'error', text: `Couldn't load the saved sync settings (${e.message}).` })
      })
    loadRuns()
    return () => {
      alive = false
    }
  }, [loadRuns])

  // Settings save themselves, a moment after the last change.
  useEffect(() => {
    if (!dirty.current || !loaded) return
    const t = setTimeout(async () => {
      dirty.current = false
      try {
        const s = await adminApi.saveEventsSync(config)
        setNextRunAt(s.nextRunAt)
      } catch (e) {
        setMsg({ kind: 'error', text: e.message || 'Could not save the sync settings.' })
      }
    }, 400)
    return () => clearTimeout(t)
  }, [config, loaded])

  useEffect(() => {
    if (!job || job.status !== 'running') return
    const id = setInterval(async () => {
      try {
        setJob(await adminApi.getScrape(job.id))
      } catch (e) {
        // The API restarted mid-run and forgot the job; its history row says so.
        if (e.message === 'Job not found') {
          setJob((j) => ({ ...j, status: 'error', error: 'The API restarted while this sync was running.' }))
        }
      }
    }, 1500)
    return () => clearInterval(id)
  }, [job?.id, job?.status])

  // When the run being followed ends, refresh the history (a beat later: its
  // row is written as the run finishes).
  useEffect(() => {
    if (!job || job.status === 'running') return
    const t = setTimeout(loadRuns, 1500)
    return () => clearTimeout(t)
  }, [job?.id, job?.status, loadRuns])

  const update = (patch) => {
    dirty.current = true
    if ('enabled' in patch || 'runAt' in patch) setNextRunAt(null)
    setConfig((c) => ({ ...c, ...patch }))
  }

  const toggleSource = (key) => {
    const has = config.sources.includes(key)
    if (has && config.sources.length === 1) {
      setMsg({ kind: 'error', text: 'Keep at least one site ticked — the sync needs somewhere to read from.' })
      return
    }
    setMsg(null)
    update({ sources: ALL_SOURCES.filter((k) => (k === key ? !has : config.sources.includes(k))) })
  }

  async function startEvents() {
    setMsg(null)
    try {
      const j = await adminApi.startEventsScrape({
        sources: config.sources,
        country: config.country,
        prune: config.prune,
      })
      if (j.alreadyRunning) {
        setMsg({ kind: 'info', text: 'A sync was already running — following that one below.' })
      }
      setJob(j)
      loadRuns()
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Could not start the events sync.' })
    }
  }

  const visibleRuns = runs && (showAll ? runs : runs.slice(0, HISTORY_PREVIEW))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events Sync"
        description="Pull what's on across Lebanon's ticketing sites straight into your events."
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Card title="Sync events">
        {!config ? (
          <p className="text-sm text-as-charcoal/55">Loading…</p>
        ) : (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-as-charcoal/70">
              Collects every current listing from the sites below — title, date(s), venue,
              description, image and the booking link — and files each one under a category. A show
              running several nights becomes <strong>one</strong> event with all its dates, and an
              event sold on two sites at once is imported <strong>once</strong>. Events you created
              by hand are never touched.
            </p>

            <div>
              <p className="mb-1 text-sm font-medium text-as-charcoal">Sites</p>
              <p className="mb-2 text-xs text-as-charcoal/55">
                These are where your events come from, for the daily sync too — changes here are
                saved as you make them. Unticking a site removes its events on the next sync — only a
                run covering every site can tell that two of them are selling the same night.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {ALL_SOURCES.map((key) => (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      config.sources.includes(key)
                        ? 'border-as-red/40 bg-as-red/[0.03]'
                        : 'border-black/10 bg-white hover:border-as-red/25'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={config.sources.includes(key)}
                      onChange={() => toggleSource(key)}
                      className="mt-0.5 h-4 w-4 accent-as-red"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-as-charcoal">
                        {SOURCE_INFO[key].label}
                      </span>
                      <span className="block text-xs text-as-charcoal/55">{SOURCE_INFO[key].note}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Country"
                hint="Tick'it also sells in the Gulf and Europe — this keeps the sync to one country."
              >
                <Select value={config.country} onChange={(e) => update({ country: e.target.value })}>
                  <option value="Lebanon">Lebanon only</option>
                  <option value="">Every country</option>
                </Select>
              </Field>
            </div>

            <Toggle
              checked={config.prune}
              onChange={(v) => update({ prune: v })}
              label="Keep the events page in step with the sites"
              description="Removes what the sites have taken down, what has already happened, and anything from a site you unticked, and hides categories left with no events. Skipped whenever a selected site fails to answer, so a site being down can never empty your events page."
            />

            <div className="space-y-3">
              <Toggle
                checked={config.enabled}
                onChange={(v) => update({ enabled: v })}
                label="Sync automatically every day"
                description={
                  !config.enabled
                    ? 'Off — events only change when you press Sync events now.'
                    : nextRunAt
                      ? `Next run: ${fmtWhen(nextRunAt)}, with the sites and options above.`
                      : 'Saving…'
                }
              />
              {config.enabled && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Time (Beirut)"
                    hint="If the server is down at that time, the sync runs as soon as it is back."
                  >
                    <TextInput
                      type="time"
                      value={config.runAt}
                      onChange={(e) => e.target.value && update({ runAt: e.target.value })}
                    />
                  </Field>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={startEvents} disabled={running}>
                {running ? 'Syncing…' : 'Sync events now'}
              </Button>
              {running && <Spinner />}
            </div>

            <Banner kind="info">
              Categories (Concerts, Parties &amp; Clubbing, Comedy, Theatrical plays…) are created
              automatically. Rename them or set their tile images under <strong>Categories</strong> —
              a later sync leaves your names and images alone. Review the new events under{' '}
              <strong>Events</strong>.
            </Banner>
          </div>
        )}
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
              {job.triggeredBy === 'schedule' && (
                <span className="text-as-charcoal/55"> — the daily sync, started automatically</span>
              )}
              {job.error && <span className="text-as-red"> — {job.error}</span>}
            </div>

            {job.status === 'done' && job.summary && (
              <Banner kind="success">
                {job.summary.created} new and {job.summary.updated} updated — {job.summary.events}{' '}
                event{job.summary.events === 1 ? '' : 's'} across {job.summary.categories} categories.
              </Banner>
            )}
            <RunSummary run={job} />
            <Log text={job.log || 'Starting…'} />
          </div>
        </Card>
      )}

      <Card
        title="History"
        actions={
          <button
            type="button"
            onClick={loadRuns}
            className="text-sm font-medium text-as-red hover:underline"
          >
            Refresh
          </button>
        }
      >
        {runs === null ? (
          <p className="text-sm text-as-charcoal/55">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-as-charcoal/55">
            No syncs recorded yet. Every run — the daily one and the ones started here — will be
            listed with how it went.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-black/5 overflow-hidden rounded-xl border border-black/10">
              {visibleRuns.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  open={openRun === run.id}
                  onToggle={() => setOpenRun((cur) => (cur === run.id ? null : run.id))}
                />
              ))}
            </ul>
            {runs.length > HISTORY_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-3 text-sm font-medium text-as-red hover:underline"
              >
                {showAll ? 'Show fewer' : `Show all ${runs.length} runs`}
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

const whenFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const fmtWhen = (iso) => (iso ? whenFmt.format(new Date(iso)) : '')

function fmtDuration(run) {
  if (!run.finishedAt) return ''
  const secs = Math.max(0, Math.round((new Date(run.finishedAt) - new Date(run.startedAt)) / 1000))
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)} min ${secs % 60}s`
}

const OUTCOMES = {
  success: { label: 'Success', cls: 'bg-green-50 text-green-700' },
  partial: { label: 'Partial', cls: 'bg-amber-50 text-amber-800' },
  failed: { label: 'Failed', cls: 'bg-as-red/10 text-as-red' },
  running: { label: 'Running', cls: 'bg-as-charcoal/5 text-as-charcoal/70' },
}

// A finished run is partial when a site it asked for didn't answer: what came
// back was imported, but nothing was delisted.
function outcomeOf(run) {
  if (run.status === 'running') return OUTCOMES.running
  if (run.status !== 'done') return OUTCOMES.failed
  return run.summary?.complete === false ? OUTCOMES.partial : OUTCOMES.success
}

const failedSites = (summary) =>
  Object.entries(summary?.sources || {})
    .filter(([, r]) => !r.ok)
    .map(([key]) => SOURCE_INFO[key]?.label || key)

function headline(run) {
  if (run.status === 'running') return 'In progress…'
  if (run.status !== 'done') return run.error || 'Failed'
  const s = run.summary
  if (!s) return ''
  const failed = failedSites(s)
  return (
    `${s.created} new · ${s.updated} updated · ${s.removed + s.delisted} cleared` +
    (failed.length ? ` — ${failed.join(', ')} didn't answer` : '')
  )
}

function RunRow({ run, open, onToggle }) {
  const outcome = outcomeOf(run)
  const duration = fmtDuration(run)
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition hover:bg-as-charcoal/[0.02]"
      >
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${outcome.cls}`}>
          {outcome.label}
        </span>
        <span className="text-sm font-medium text-as-charcoal">{fmtWhen(run.startedAt)}</span>
        <span className="text-xs text-as-charcoal/50">
          {run.triggeredBy === 'schedule' ? 'Automatic' : 'Manual'}
          {duration && ` · ${duration}`}
        </span>
        <span className="w-full truncate text-xs text-as-charcoal/60 sm:w-auto sm:flex-1 sm:text-right">
          {headline(run)}
        </span>
      </button>
      {open && <RunDetails run={run} />}
    </li>
  )
}

function RunDetails({ run }) {
  const [log, setLog] = useState(null)
  useEffect(() => {
    let alive = true
    adminApi
      .getEventsSyncRun(run.id)
      .then((r) => alive && setLog(r.log || (r.status === 'running'
        ? 'Still running — the log is saved when it finishes.'
        : '(no output)')))
      .catch((e) => alive && setLog(`Couldn't load the log: ${e.message}`))
    return () => {
      alive = false
    }
  }, [run.id])

  return (
    <div className="space-y-4 border-t border-black/5 bg-as-charcoal/[0.02] px-4 py-4">
      {run.status !== 'done' && run.error && <Banner kind="error">{run.error}</Banner>}
      <RunSummary run={run} />
      <Log text={log ?? 'Loading…'} />
    </div>
  )
}

// What a run did: the counts, then each site's answer. Shared by the live
// result and the history, so a run reads the same in both.
function RunSummary({ run }) {
  const s = run.summary
  if (!s) return null
  const done = run.status === 'done'
  const failed = failedSites(s)
  return (
    <>
      {done && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="From the sites" value={sourceTotal(s)} />
          <Stat label="Nights merged into a run" value={s.runsMerged} />
          <Stat label="Cross-listed, imported once" value={s.duplicates} />
          <Stat label="Cleared (past / delisted)" value={s.removed + s.delisted} />
          {s.categoryVisibility?.hidden?.length > 0 && (
            <Stat
              label={`Empty categories hidden: ${s.categoryVisibility.hidden.join(', ')}`}
              value={s.categoryVisibility.hidden.length}
            />
          )}
        </div>
      )}

      {s.sources && Object.keys(s.sources).length > 0 && (
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(s.sources).map(([key, r]) => (
                <tr key={key} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-as-charcoal">
                    {SOURCE_INFO[key]?.label || key}
                  </td>
                  <td className="px-4 py-2.5 text-as-charcoal/60">
                    {r.ok ? `${r.events} listing${r.events === 1 ? '' : 's'}` : 'failed'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-as-red">{r.error || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {done && s.complete === false && (
        <Banner kind="warning">
          {failed.length ? `${failed.join(', ')} didn't answer` : 'A site was skipped'}, so nothing
          was delisted this time — events a site has stopped selling stay up until the next complete
          run.
        </Banner>
      )}
    </>
  )
}

const sourceTotal = (s) =>
  Object.values(s.sources || {}).reduce((n, r) => n + (r.events || 0), 0)

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4">
      <p className="text-2xl font-extrabold text-as-charcoal">{value}</p>
      <p className="mt-0.5 text-xs text-as-charcoal/55">{label}</p>
    </div>
  )
}

function Log({ text }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-as-charcoal/45">Log</p>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-[#1e1e1e] p-4 text-xs leading-relaxed text-[#d4d4d4]">
        {text}
      </pre>
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
