import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Button, Banner, PageHeader, Field, Select, Toggle } from '../ui.jsx'

// The ticketing partners the sync can pull from. Keys must match EVENT_SOURCES
// in server/src/scraper.js — the API ignores anything it doesn't recognise.
const SOURCE_INFO = {
  ticketingboxoffice: { label: 'Ticketing Box Office', note: 'Concerts, theatre, ballet, sports' },
  tickit: { label: "Tick'it", note: 'Nightlife, parties and comedy' },
  ihjoz: { label: 'ihjoz', note: 'Concerts, festivals, workshops, activities' },
}
const ALL_SOURCES = Object.keys(SOURCE_INFO)

export default function ScraperAdmin() {
  const [sources, setSources] = useState(ALL_SOURCES)
  const [country, setCountry] = useState('Lebanon')
  const [prune, setPrune] = useState(true)
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

  const toggleSource = (key) =>
    setSources((cur) => (cur.includes(key) ? cur.filter((s) => s !== key) : [...cur, key]))

  async function startEvents() {
    setMsg(null)
    if (!sources.length) {
      setMsg({ kind: 'error', text: 'Pick at least one site to sync from.' })
      return
    }
    try {
      setJob(await adminApi.startEventsScrape({ sources, country, prune }))
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Could not start the events sync.' })
    }
  }

  const s = job?.summary

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events Sync"
        description="Pull what's on across Lebanon's ticketing sites straight into your events."
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Card title="Sync events">
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-as-charcoal/70">
            Collects every current listing from the sites below — title, date(s), venue,
            description, image and the booking link — and files each one under a category. A show
            running several nights becomes <strong>one</strong> event with all its dates, and an
            event sold on two sites at once is imported <strong>once</strong>. Events you created by
            hand are never touched.
          </p>

          <div>
            <p className="mb-1 text-sm font-medium text-as-charcoal">Sites</p>
            <p className="mb-2 text-xs text-as-charcoal/55">
              These are where your events come from. Unticking a site removes its events on the
              next sync — only a run covering every site can tell that two of them are selling the
              same night.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {ALL_SOURCES.map((key) => (
                <label
                  key={key}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                    sources.includes(key)
                      ? 'border-as-red/40 bg-as-red/[0.03]'
                      : 'border-black/10 bg-white hover:border-as-red/25'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={sources.includes(key)}
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
              <Select value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="Lebanon">Lebanon only</option>
                <option value="">Every country</option>
              </Select>
            </Field>
          </div>

          <Toggle
            checked={prune}
            onChange={setPrune}
            label="Keep the events page in step with the sites"
            description="Removes what the sites have taken down, what has already happened, and anything from a site you unticked. Skipped whenever a selected site fails to answer, so a site being down can never empty your events page."
          />

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

            {job.status === 'done' && s && (
              <>
                <Banner kind="success">
                  {s.created} new and {s.updated} updated — {s.events} event
                  {s.events === 1 ? '' : 's'} across {s.categories} categories.
                </Banner>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="From the sites" value={sourceTotal(s)} />
                  <Stat label="Nights merged into a run" value={s.runsMerged} />
                  <Stat label="Cross-listed, imported once" value={s.duplicates} />
                  <Stat label="Cleared (past / delisted)" value={s.removed + s.delisted} />
                </div>

                <div className="overflow-hidden rounded-xl border border-black/10">
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(s.sources || {}).map(([key, r]) => (
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

                {!s.complete && (
                  <Banner kind="info">
                    A site was skipped or didn't answer, so nothing was removed — your existing
                    events were left as they are.
                  </Banner>
                )}
              </>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-as-charcoal/45">Log</p>
              <pre className="max-h-96 overflow-auto rounded-xl bg-[#1e1e1e] p-4 text-xs leading-relaxed text-[#d4d4d4] whitespace-pre-wrap">
                {job.log || 'Starting…'}
              </pre>
            </div>
          </div>
        </Card>
      )}
    </div>
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

function Spinner() {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-as-charcoal/55">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-as-red/20 border-t-as-red" />
      Working…
    </span>
  )
}
