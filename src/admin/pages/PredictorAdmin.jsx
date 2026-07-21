import { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { downloadXlsx } from '../../lib/xlsx.js'
import { Card, Field, TextInput, TextArea, Toggle, Button, Banner, PageHeader, SaveBar } from '../ui.jsx'

// A draw number as a padded ticket, e.g. 7 → "#0007".
const formatDraw = (n) => (n == null || n === '' ? '' : `#${String(n).padStart(4, '0')}`)

// Convert an ISO timestamp from the API to the value a <input type="datetime-local">
// expects (local "YYYY-MM-DDTHH:mm"), and back.
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const blankSettings = {
  enabled: false, notifyWhatsapp: false, title: '', subtitle: '', intro: '', successMessage: '',
  prizeEnabled: true, prizeTitle: '', prizeDescription: '', prizeImageUrl: '', prizeAmount: '',
  deadline: '', closed: false,
  entryFee: 5, paymentEnabled: true, paymentRecipient: 'AS Company', paymentNote: '#as.com.lb', paymentInstructions: '',
  howToWin: [], repostUrl: '',
  shareUrl: 'https://store.as.com.lb', shareMessage: '', terms: [],
  autoOpen: false, triggerType: 'load', delaySeconds: 0.5, scrollPercent: 40,
}
const blankMatch = {
  stage: '', teamA: '', teamACode: '', teamAFlag: '', teamB: '', teamBCode: '', teamBFlag: '',
  kickoff: '', sort: 0, visible: true,
}

// The scoreline of one entry, e.g. "Sagesse 88 — 91 Al Riyadi".
const scoreLine = (p) => {
  const pick = Array.isArray(p.picks) ? p.picks[0] : null
  if (!pick || pick.scoreA == null) return '—'
  return `${pick.teamA || 'Team A'} ${pick.scoreA} — ${pick.scoreB} ${pick.teamB || 'Team B'}`
}
// Just the numbers, e.g. "88 — 91" — what the insights group entries by.
const scoreOnly = (p) => {
  const pick = Array.isArray(p.picks) ? p.picks[0] : null
  return pick && pick.scoreA != null ? `${pick.scoreA} — ${pick.scoreB}` : ''
}

// One team inside the match form: display name + club logo (upload or URL).
function TeamEditor({ label, name, logo, onName, onLogo, onUpload, uploading }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4">
      <p className="mb-3 text-sm font-bold text-as-charcoal">{label}</p>
      <div className="flex items-center gap-3">
        {logo ? (
          <img src={logo} alt="" className="h-12 w-12 rounded object-contain ring-1 ring-black/10" />
        ) : (
          <span className="grid h-12 w-12 place-items-center rounded bg-as-charcoal/5 text-[10px] text-as-charcoal/40">logo</span>
        )}
        <div className="flex-1">
          <Field label="Team name">
            <TextInput value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Sagesse Sports Club" />
          </Field>
        </div>
      </div>
      <div className="mt-2 grid gap-2">
        <Field label="Club logo" hint="A PNG with a transparent background looks best.">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }}
              className="text-sm"
            />
            {uploading && <span className="text-xs text-as-charcoal/50">Uploading…</span>}
            {logo && (
              <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={() => onLogo('')}>Remove</Button>
            )}
          </div>
        </Field>
        <Field label="…or paste a logo URL">
          <TextInput value={logo} onChange={(e) => onLogo(e.target.value)} placeholder="https://…" />
        </Field>
      </div>
    </div>
  )
}

// A simple editable list of lines — used for the Terms & Conditions bullets.
function LineList({ value, onChange, placeholder }) {
  const set = (i, v) => onChange(value.map((x, j) => (j === i ? v : x)))
  return (
    <div className="space-y-2">
      {value.map((line, i) => (
        <div key={i} className="flex gap-2">
          <TextInput value={line} onChange={(e) => set(i, e.target.value)} placeholder={placeholder} />
          <Button type="button" variant="ghost" className="shrink-0 px-3 py-1.5" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={() => onChange([...value, ''])}>+ Add line</Button>
    </div>
  )
}

// A single headline metric for the insights row.
function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-as-charcoal/45">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums text-as-charcoal">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-as-charcoal/50">{sub}</p>}
    </div>
  )
}

// Horizontal ranking of the most-guessed scorelines. One measure (# of entries)
// across labels → a single-hue magnitude chart: brand red bars anchored to the
// left baseline, each directly labelled with its count and share.
function RankedRows({ rows }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm font-semibold tabular-nums text-as-charcoal sm:w-40">{r.label}</span>
          <div className="flex flex-1 items-center gap-2">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-as-charcoal/[0.06]">
              <div
                className="h-full rounded-full bg-as-red transition-[width] duration-500"
                style={{ width: `${r.count ? Math.max((r.count / max) * 100, 4) : 0}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-sm font-bold tabular-nums text-as-charcoal">{r.count}</span>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-as-charcoal/45">{r.pct}%</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

// Compact bars of entries per day. Single series → the same brand red; each bar
// carries its date + count in a native tooltip on hover.
function EntriesPerDay({ data }) {
  const max = data.reduce((m, d) => Math.max(m, d.count), 0) || 1
  return (
    <div>
      <div className="flex h-24 items-end gap-1.5">
        {data.map((d) => (
          <div key={d.date} className="group flex flex-1 flex-col items-center justify-end" title={`${d.label}: ${d.count} ${d.count === 1 ? 'entry' : 'entries'}`}>
            <span className="mb-1 text-[10px] font-bold tabular-nums text-as-charcoal/50 opacity-0 transition group-hover:opacity-100">{d.count || ''}</span>
            <div
              className="w-full rounded-t bg-as-red/80 transition group-hover:bg-as-red"
              style={{ height: `${d.count ? Math.max((d.count / max) * 100, 6) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-as-charcoal/40">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  )
}

export default function PredictorAdmin() {
  const [settings, setSettings] = useState(blankSettings)
  const [matches, setMatches] = useState([])
  const [predictions, setPredictions] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blankMatch)
  const [prizeFile, setPrizeFile] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingMatch, setSavingMatch] = useState(false)
  const [msg, setMsg] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [entriesTab, setEntriesTab] = useState('active')
  const [showAllScores, setShowAllScores] = useState(false)

  const setS = (key) => (e) => setSettings((s) => ({ ...s, [key]: e.target.value }))
  const setF = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    try {
      const [p, m] = await Promise.all([adminApi.getPredictor(), adminApi.listPredictorMatches()])
      if (p) {
        setSettings({
          enabled: p.enabled === true,
          notifyWhatsapp: p.notifyWhatsapp === true,
          title: p.title || '', subtitle: p.subtitle || '', intro: p.intro || '',
          successMessage: p.successMessage || '',
          prizeEnabled: p.prizeEnabled !== false,
          prizeTitle: p.prizeTitle || '', prizeDescription: p.prizeDescription || '',
          prizeImageUrl: p.prizeImageUrl || '', prizeAmount: p.prizeAmount || '',
          deadline: toLocalInput(p.deadline), closed: p.closed === true,
          entryFee: p.entryFee ?? 5,
          paymentEnabled: p.paymentEnabled !== false,
          paymentRecipient: p.paymentRecipient || 'AS Company',
          paymentNote: p.paymentNote || '',
          paymentInstructions: p.paymentInstructions || '',
          howToWin: Array.isArray(p.howToWin) ? p.howToWin : [],
          repostUrl: p.repostUrl || '',
          shareUrl: p.shareUrl || 'https://store.as.com.lb',
          shareMessage: p.shareMessage || '',
          terms: Array.isArray(p.terms) ? p.terms : [],
          autoOpen: p.autoOpen === true,
          triggerType: p.triggerType === 'scroll' ? 'scroll' : 'load',
          delaySeconds: p.delaySeconds ?? 0.5,
          scrollPercent: p.scrollPercent ?? 40,
        })
      }
      setMatches(Array.isArray(m) ? m : [])
    } catch {
      setMsg({ kind: 'error', text: 'Could not load the predictor.' })
    }
    try {
      setPredictions(await adminApi.listPredictions())
    } catch {
      /* predictions are optional to view */
    }
  }
  useEffect(() => { load() }, [])

  async function saveSettings(e) {
    e.preventDefault()
    setSavingSettings(true)
    setMsg(null)
    try {
      let prizeImageUrl = settings.prizeImageUrl
      if (prizeFile) {
        const up = await adminApi.upload(prizeFile)
        prizeImageUrl = up.url
      }
      await adminApi.savePredictor({
        ...settings,
        prizeImageUrl,
        terms: settings.terms.map((t) => t.trim()).filter(Boolean),
        deadline: settings.deadline ? new Date(settings.deadline).toISOString() : null,
      })
      setPrizeFile(null)
      await load()
      setMsg({ kind: 'success', text: 'Game settings saved.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    } finally {
      setSavingSettings(false)
    }
  }

  const startNew = () => { setForm({ ...blankMatch, sort: matches.length }); setEditing('new') }
  const startEdit = (m) => {
    setForm({
      stage: m.stage || '', teamA: m.teamA || '', teamACode: m.teamACode || '', teamAFlag: m.teamAFlag || '',
      teamB: m.teamB || '', teamBCode: m.teamBCode || '', teamBFlag: m.teamBFlag || '',
      kickoff: toLocalInput(m.kickoff), sort: m.sort || 0, visible: m.visible !== false,
    })
    setEditing(m.id)
  }
  const cancel = () => setEditing(null)

  // Upload a club logo and store its URL on the match form.
  async function uploadLogo(side, file) {
    setUploadingLogo(side)
    setMsg(null)
    try {
      const up = await adminApi.upload(file)
      setForm((f) => ({ ...f, [side === 'a' ? 'teamAFlag' : 'teamBFlag']: up.url }))
    } catch (err) {
      setMsg({ kind: 'error', text: 'Logo upload failed: ' + (err?.message || 'error') })
    } finally {
      setUploadingLogo('')
    }
  }

  async function saveMatch(e) {
    e.preventDefault()
    setSavingMatch(true)
    setMsg(null)
    try {
      const payload = {
        ...form,
        sort: Number(form.sort) || 0,
        kickoff: form.kickoff ? new Date(form.kickoff).toISOString() : null,
      }
      if (editing === 'new') await adminApi.createPredictorMatch(payload)
      else await adminApi.updatePredictorMatch(editing, payload)
      setEditing(null)
      await load()
      setMsg({ kind: 'success', text: 'Match saved.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    } finally {
      setSavingMatch(false)
    }
  }

  async function removeMatch(m) {
    if (!confirm(`Delete the match ${m.teamA || 'Team A'} vs ${m.teamB || 'Team B'}?`)) return
    await adminApi.deletePredictorMatch(m.id)
    await load()
  }

  async function removePrediction(p) {
    if (!confirm(`Permanently delete ${p.fullName}'s entry? Use Archive instead if you may need it later.`)) return
    await adminApi.deletePrediction(p.id)
    setPredictions((list) => list.filter((x) => x.id !== p.id))
  }

  // Archive keeps the entry on record but frees the mobile number, so the same
  // player can enter the next round. Restore puts it back among the active ones.
  async function archivePrediction(p, archived) {
    setMsg(null)
    try {
      const updated = await adminApi.archivePrediction(p.id, archived)
      setPredictions((list) => list.map((x) => (x.id === p.id ? updated : x)))
    } catch (err) {
      setMsg({ kind: 'error', text: err?.message || 'Could not update the entry.' })
    }
  }

  async function archiveAll() {
    const count = predictions.filter((p) => !p.archived).length
    if (!count) return
    if (!confirm(`Archive all ${count} active entries? They stay visible under "Archived", and everyone can enter again.`)) return
    setMsg(null)
    try {
      await adminApi.archiveAllPredictions()
      setPredictions(await adminApi.listPredictions())
      setEntriesTab('archived')
      setMsg({ kind: 'success', text: `Archived ${count} entries — the game is ready for a new round.` })
    } catch (err) {
      setMsg({ kind: 'error', text: err?.message || 'Could not archive the entries.' })
    }
  }

  const activeEntries = predictions.filter((p) => !p.archived)
  const archivedEntries = predictions.filter((p) => p.archived)
  const shownEntries = entriesTab === 'archived' ? archivedEntries : activeEntries

  // All-time dashboard numbers, recomputed whenever entries change.
  const insights = useMemo(() => {
    const pad = (n) => String(n).padStart(2, '0')
    const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    const all = predictions
    const totalEntries = all.length
    const activeCount = all.filter((p) => !p.archived).length
    const uniqueParticipants = new Set(
      all.map((p) => String(p.mobile || '').replace(/\D/g, '')).filter(Boolean),
    ).size

    // Tally the guessed scorelines.
    const counts = new Map()
    for (const p of all) {
      const s = scoreOnly(p)
      if (s) counts.set(s, (counts.get(s) || 0) + 1)
    }
    const scoreRows = [...counts.entries()]
      .map(([label, count]) => ({ label, count, pct: totalEntries ? Math.round((count / totalEntries) * 100) : 0 }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

    // Entries per day across the 14 days ending on the most recent entry.
    const dayCounts = new Map()
    let maxTime = 0
    for (const p of all) {
      const t = new Date(p.createdAt)
      if (Number.isNaN(t.getTime())) continue
      dayCounts.set(dayKey(t), (dayCounts.get(dayKey(t)) || 0) + 1)
      maxTime = Math.max(maxTime, t.getTime())
    }
    const end = maxTime ? new Date(maxTime) : new Date()
    const byDay = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(end)
      d.setDate(d.getDate() - i)
      byDay.push({
        date: dayKey(d),
        label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        count: dayCounts.get(dayKey(d)) || 0,
      })
    }

    return {
      totalEntries, activeCount, uniqueParticipants, scoreRows, byDay,
      topScore: scoreRows[0] || null,
    }
  }, [predictions])

  // Mirror of the server's toWhatsAppNumber (server/src/whatsapp.js): digits-only
  // international form, defaulting local Lebanese numbers to +961.
  const toWhatsAppNumber = (mobile, cc = '961') => {
    let d = String(mobile || '').replace(/\D/g, '')
    if (!d) return ''
    if (d.startsWith(cc) && d.length >= cc.length + 7) return d
    return cc + d.replace(/^0+/, '')
  }

  // Open WhatsApp (web or app) with a pre-filled recap of the entry.
  function sendPrediction(p) {
    const number = toWhatsAppNumber(p.mobile)
    if (!number) {
      setMsg({ kind: 'error', text: `No valid mobile number on ${p.fullName}'s entry.` })
      return
    }
    const firstName = (p.fullName || '').trim().split(/\s+/)[0] || 'there'
    const drawLine = p.drawNumber != null ? `\n\nYour draw number: ${formatDraw(p.drawNumber)} — keep it safe!` : ''
    const text = [
      `Hello ${firstName}! 🏀`,
      '',
      `Thank you for taking part in the AS Company ${settings.title || 'Guess the Score'} game. We’re pleased to confirm your predicted final score:`,
      '',
      `🏀 ${scoreLine(p)}${drawLine}`,
      '',
      'Good luck — we’ll be in touch if you’re our lucky winner! 🏆',
      '',
      'Best regards,',
      'The AS Company Team',
    ].join('\n')
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  // Export every entry (active + archived) to an Excel sheet, one row each.
  function exportEntries() {
    if (predictions.length === 0) {
      setMsg({ kind: 'error', text: 'There are no entries to export yet.' })
      return
    }
    const header = ['Draw #', 'Full name', 'Mobile', 'Predicted series', 'Status', 'Submitted', 'Archived at']
    const rows = predictions.map((p) => [
      p.drawNumber != null ? formatDraw(p.drawNumber) : '',
      p.fullName || '',
      p.mobile || '',
      scoreLine(p),
      p.archived ? 'Archived' : 'Active',
      p.createdAt ? new Date(p.createdAt).toLocaleString('en-GB') : '',
      p.archived && p.archivedAt ? new Date(p.archivedAt).toLocaleString('en-GB') : '',
    ])
    const stamp = new Date().toISOString().slice(0, 10)
    downloadXlsx(`guess-the-score-entries-${stamp}.xlsx`, [header, ...rows], 'Entries')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guess the Score"
        description="Run the basketball score game: set the match, the prize and the terms, and collect the entries."
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {/* Dashboard — who entered and what they guessed */}
      <Card title="Insights">
        {insights.totalEntries === 0 ? (
          <p className="text-sm text-as-charcoal/50">
            Entries and guessed scores will appear here once players start submitting.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile
                label="Total entries"
                value={insights.totalEntries}
                sub={`${insights.activeCount} active · ${insights.totalEntries - insights.activeCount} archived`}
              />
              <StatTile label="Participants" value={insights.uniqueParticipants} sub="unique mobile numbers" />
              <StatTile
                label="Most-guessed"
                value={insights.topScore ? insights.topScore.label : '—'}
                sub={insights.topScore ? `${insights.topScore.count} entries · ${insights.topScore.pct}%` : ''}
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-as-charcoal">Most-guessed scores</h3>
                {insights.scoreRows.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setShowAllScores((v) => !v)}
                    className="text-xs font-semibold text-as-red hover:underline"
                  >
                    {showAllScores ? 'Show top 10' : `Show all ${insights.scoreRows.length}`}
                  </button>
                )}
              </div>
              <RankedRows rows={showAllScores ? insights.scoreRows : insights.scoreRows.slice(0, 10)} />
            </div>

            <div>
              <h3 className="mb-3 text-sm font-bold text-as-charcoal">Entries over the last 14 days</h3>
              <EntriesPerDay data={insights.byDay} />
            </div>
          </div>
        )}
      </Card>

      {/* Settings + prize */}
      <form onSubmit={saveSettings} className="space-y-6">
        <Card title="Game & prize">
          <div className="space-y-4">
            <Toggle
              checked={settings.enabled}
              onChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
              label={settings.enabled ? 'Game is live' : 'Game is off'}
              description="When on (and at least one match exists), the animated basketball appears in the nav bar."
            />
            <Toggle
              checked={settings.closed}
              onChange={(v) => setSettings((s) => ({ ...s, closed: v }))}
              label={settings.closed ? 'Entries closed' : 'Entries open'}
              description="Close to stop new submissions while still showing the game."
            />
            <Toggle
              checked={settings.notifyWhatsapp}
              onChange={(v) => setSettings((s) => ({ ...s, notifyWhatsapp: v }))}
              label={settings.notifyWhatsapp ? 'WhatsApp confirmation ON' : 'WhatsApp confirmation OFF'}
              description="Send each player a WhatsApp confirming their score. Requires the WhatsApp number to be configured on the server."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" hint="The big headline on the card."><TextInput value={settings.title} onChange={setS('title')} placeholder="Guess the Score" /></Field>
              <Field label="Prize amount" hint="Shown in gold next to the title, e.g. “$10,000”.">
                <TextInput value={settings.prizeAmount} onChange={setS('prizeAmount')} placeholder="$10,000" />
              </Field>
            </div>
            <Field label="Subtitle"><TextInput value={settings.subtitle} onChange={setS('subtitle')} placeholder="Predict the final series score." /></Field>
            <Field label="Intro text" hint="A small line under the score boxes (optional).">
              <TextArea value={settings.intro} onChange={setS('intro')} placeholder="One entry per person — closes at tip-off." />
            </Field>
            <Field label="Submission deadline (optional)" hint="After this time, entries are automatically closed.">
              <TextInput type="datetime-local" value={settings.deadline} onChange={setS('deadline')} />
            </Field>
            <Field label="Success message" hint="Shown after a visitor submits their score.">
              <TextArea value={settings.successMessage} onChange={setS('successMessage')} placeholder="You're in the draw! Good luck…" />
            </Field>

            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <p className="mb-3 text-sm font-bold text-amber-700">🏆 The prize</p>
              <div className="mb-4">
                <Toggle
                  checked={settings.prizeEnabled}
                  onChange={(v) => setSettings((s) => ({ ...s, prizeEnabled: v }))}
                  label={settings.prizeEnabled ? 'Prize shown' : 'Prize hidden'}
                  description="Turn off to run the game without showing any prize."
                />
              </div>
              <div className="grid gap-4">
                <p className="text-xs text-as-charcoal/55">
                  The voucher card on the game screen is drawn automatically — its face value is the first
                  amount found in “Prize amount” or “Prize title” (e.g. “2 × $100 Vouchers” → $100).
                </p>
                <Field label="Prize title"><TextInput value={settings.prizeTitle} onChange={setS('prizeTitle')} placeholder="e.g. 2 vouchers — $100 each" /></Field>
                <Field label="Prize description"><TextArea value={settings.prizeDescription} onChange={setS('prizeDescription')} placeholder="What the lucky winner takes home." /></Field>
                <Field label="Prize image (optional)" hint="Replaces the trophy next to the title.">
                  <div className="flex items-center gap-4">
                    {(prizeFile || settings.prizeImageUrl) && (
                      <img
                        src={prizeFile ? URL.createObjectURL(prizeFile) : settings.prizeImageUrl}
                        alt="prize"
                        className="h-16 w-16 rounded-lg object-cover ring-1 ring-black/5"
                      />
                    )}
                    <input type="file" accept="image/*" onChange={(e) => setPrizeFile(e.target.files?.[0] || null)} className="text-sm" />
                    {(prizeFile || settings.prizeImageUrl) && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-3 py-1.5"
                        onClick={() => { setPrizeFile(null); setSettings((s) => ({ ...s, prizeImageUrl: '' })) }}
                      >
                        Remove image
                      </Button>
                    )}
                  </div>
                </Field>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Where players go after entering">
          <div className="space-y-4">
            <Field label="Store link" hint="The “Done” button on the final screen sends players here. Defaults to the AS Store.">
              <TextInput value={settings.shareUrl} onChange={setS('shareUrl')} placeholder="https://store.as.com.lb" />
            </Field>
          </div>
        </Card>

        <Card title="Terms and Conditions">
          <div className="space-y-3">
            <p className="text-sm text-as-charcoal/55">
              Shown as red bullets at the bottom of the game card. Leave empty to hide the section.
            </p>
            <LineList
              value={settings.terms}
              onChange={(terms) => setSettings((s) => ({ ...s, terms }))}
              placeholder="e.g. Only one entry per mobile number."
            />
          </div>
        </Card>

        <Card title="Auto-popup">
          <div className="space-y-4">
            <Toggle
              checked={settings.autoOpen}
              onChange={(v) => setSettings((s) => ({ ...s, autoOpen: v }))}
              label={settings.autoOpen ? 'Auto-popup ON' : 'Auto-popup OFF'}
              description="When on, the game opens on its own once per visit — visitors don't have to tap the basketball."
            />
            <Field label="When should it appear?">
              <select
                value={settings.triggerType}
                onChange={setS('triggerType')}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-as-charcoal outline-none transition focus:border-as-red focus:ring-2 focus:ring-as-red/20"
              >
                <option value="load">After the page opens</option>
                <option value="scroll">After scrolling down</option>
              </select>
            </Field>
            {settings.triggerType === 'scroll' ? (
              <Field label="Show after scrolling (%)" hint="e.g. 40 = once the visitor has scrolled 40% down the page.">
                <TextInput type="number" min="1" max="100" step="1" value={settings.scrollPercent} onChange={setS('scrollPercent')} placeholder="40" />
              </Field>
            ) : (
              <Field label="Delay (seconds)" hint="e.g. 0.5 = half a second after the page opens.">
                <TextInput type="number" min="0" step="0.5" value={settings.delaySeconds} onChange={setS('delaySeconds')} placeholder="0.5" />
              </Field>
            )}
          </div>
        </Card>

        <SaveBar saving={savingSettings} label="Save game settings" />
      </form>

      {/* The match being played */}
      <Card
        title="Match"
        actions={!editing && <Button onClick={startNew} type="button">+ New match</Button>}
      >
        <p className="mb-4 text-sm text-as-charcoal/55">
          The game card shows the first visible match. Hide the others to switch which game is live.
        </p>

        {editing && (
          <form onSubmit={saveMatch} className="mb-6 space-y-4 rounded-2xl border border-black/10 bg-as-charcoal/[0.02] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Game label" hint="Shown above the score boxes, e.g. “Game 1”.">
                <TextInput value={form.stage} onChange={setF('stage')} placeholder="Game 1" />
              </Field>
              <Field label="Tip-off" hint="The date shown next to the game label.">
                <TextInput type="datetime-local" value={form.kickoff} onChange={setF('kickoff')} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TeamEditor
                label="Home team"
                name={form.teamA} logo={form.teamAFlag}
                onName={(v) => setForm((f) => ({ ...f, teamA: v }))}
                onLogo={(v) => setForm((f) => ({ ...f, teamAFlag: v }))}
                onUpload={(file) => uploadLogo('a', file)}
                uploading={uploadingLogo === 'a'}
              />
              <TeamEditor
                label="Away team"
                name={form.teamB} logo={form.teamBFlag}
                onName={(v) => setForm((f) => ({ ...f, teamB: v }))}
                onLogo={(v) => setForm((f) => ({ ...f, teamBFlag: v }))}
                onUpload={(file) => uploadLogo('b', file)}
                uploading={uploadingLogo === 'b'}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sort order"><TextInput type="number" value={form.sort} onChange={setF('sort')} /></Field>
            </div>
            <Toggle
              checked={form.visible}
              onChange={(v) => setForm((f) => ({ ...f, visible: v }))}
              label={form.visible ? 'Shown in the game' : 'Hidden'}
              description="Hide a match without deleting it."
            />
            <div className="flex gap-3">
              <Button type="submit" disabled={savingMatch}>{savingMatch ? 'Saving…' : 'Save match'}</Button>
              <Button type="button" variant="ghost" onClick={cancel}>Cancel</Button>
            </div>
          </form>
        )}

        {matches.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">No match yet. Add the game players will predict to start.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {matches.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {m.teamAFlag && <img src={m.teamAFlag} alt="" className="h-8 w-8 rounded object-contain ring-1 ring-black/10" />}
                  {m.teamBFlag && <img src={m.teamBFlag} alt="" className="h-8 w-8 rounded object-contain ring-1 ring-black/10" />}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-as-charcoal">
                      {m.teamA || 'Team A'} <span className="text-as-charcoal/40">vs</span> {m.teamB || 'Team B'}
                    </p>
                    <p className="truncate text-sm text-as-charcoal/55">
                      {[m.stage, m.kickoff ? new Date(m.kickoff).toLocaleString('en-GB') : '', m.visible === false ? 'hidden' : '']
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" onClick={() => startEdit(m)} className="px-3 py-1.5" type="button">Edit</Button>
                  <Button variant="danger" onClick={() => removeMatch(m)} className="px-3 py-1.5" type="button">Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Submissions */}
      <Card
        title="Entries"
        actions={
          predictions.length > 0 && (
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={exportEntries}>Export Excel</Button>
              {entriesTab === 'active' && activeEntries.length > 0 && (
                <Button variant="ghost" type="button" onClick={archiveAll}>Archive all</Button>
              )}
            </div>
          )
        }
      >
        <div className="mb-4 flex gap-2">
          {[
            ['active', `Active (${activeEntries.length})`],
            ['archived', `Archived (${archivedEntries.length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setEntriesTab(key)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                entriesTab === key
                  ? 'bg-as-red text-white'
                  : 'bg-as-charcoal/5 text-as-charcoal/60 hover:bg-as-charcoal/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {shownEntries.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">
            {entriesTab === 'archived' ? 'No archived entries.' : 'No entries yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {shownEntries.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-as-charcoal">
                      {p.drawNumber != null && (
                        <span className="shrink-0 rounded-md bg-as-red/10 px-1.5 py-0.5 text-xs font-bold tabular-nums text-as-red">
                          {formatDraw(p.drawNumber)}
                        </span>
                      )}
                      <span className="truncate">{p.fullName}</span>
                      <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold tabular-nums text-amber-700">
                        {scoreOnly(p) || '—'}
                      </span>
                    </p>
                    <p className="truncate text-sm text-as-charcoal/55">
                      {p.mobile}
                      {' · '}
                      {new Date(p.createdAt).toLocaleString('en-GB')}
                      {p.archived && p.archivedAt ? ` · archived ${new Date(p.archivedAt).toLocaleDateString('en-GB')}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="ghost" type="button" className="px-3 py-1.5" onClick={() => sendPrediction(p)}>Send</Button>
                    <Button variant="ghost" type="button" className="px-3 py-1.5" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      {expanded === p.id ? 'Hide' : 'View'}
                    </Button>
                    <Button variant="ghost" type="button" className="px-3 py-1.5" onClick={() => archivePrediction(p, !p.archived)}>
                      {p.archived ? 'Restore' : 'Archive'}
                    </Button>
                    <Button variant="danger" type="button" className="px-3 py-1.5" onClick={() => removePrediction(p)}>Delete</Button>
                  </div>
                </div>
                {expanded === p.id && (
                  <div className="mt-3 space-y-2 rounded-xl bg-as-charcoal/[0.03] p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-as-charcoal/70">Predicted series</span>
                      <span className="shrink-0 text-right font-bold text-as-charcoal">🏀 {scoreLine(p)}</span>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
