import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { COUNTRIES, flagUrl, countryName } from '../../lib/flags.js'
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
  prizeEnabled: true, prizeTitle: '', prizeDescription: '', prizeImageUrl: '', deadline: '', closed: false,
  entryFee: 5, paymentEnabled: true, paymentRecipient: 'AS Company', paymentNote: '#as.com.lb', paymentInstructions: '',
  howToWin: [], repostUrl: '',
  autoOpen: false, triggerType: 'load', delaySeconds: 0.5, scrollPercent: 40,
}
const blankMatch = {
  stage: '', teamA: '', teamACode: '', teamAFlag: '', teamB: '', teamBCode: '', teamBFlag: '',
  kickoff: '', sort: 0, visible: true,
}

// One team's flag/name picker inside the match form.
function TeamPicker({ label, code, name, flag, onCode, onName, onFlag }) {
  const preview = flagUrl(code, flag)
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4">
      <p className="mb-3 text-sm font-bold text-as-charcoal">{label}</p>
      <div className="flex items-center gap-3">
        {preview ? (
          <img src={preview} alt="" className="h-9 w-12 rounded object-cover ring-1 ring-black/10" />
        ) : (
          <span className="grid h-9 w-12 place-items-center rounded bg-as-charcoal/5 text-xs text-as-charcoal/40">flag</span>
        )}
        <div className="grid flex-1 gap-2">
          <Field label="Country (flag)">
            <select
              value={code}
              onChange={(e) => onCode(e.target.value, countryName(e.target.value))}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-as-charcoal outline-none transition focus:border-as-red focus:ring-2 focus:ring-as-red/20"
            >
              <option value="">— Select country —</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <div className="mt-2 grid gap-2">
        <Field label="Display name" hint="Defaults to the country; edit for things like “USA”.">
          <TextInput value={name} onChange={(e) => onName(e.target.value)} placeholder="Team name" />
        </Field>
        <Field label="Custom flag URL (optional)" hint="Overrides the country flag if set.">
          <TextInput value={flag} onChange={(e) => onFlag(e.target.value)} placeholder="https://…" />
        </Field>
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
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingMatch, setSavingMatch] = useState(false)
  const [msg, setMsg] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [entriesTab, setEntriesTab] = useState('active')

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
          prizeImageUrl: p.prizeImageUrl || '',
          deadline: toLocalInput(p.deadline), closed: p.closed === true,
          entryFee: p.entryFee ?? 5,
          paymentEnabled: p.paymentEnabled !== false,
          paymentRecipient: p.paymentRecipient || 'AS Company',
          paymentNote: p.paymentNote || '',
          paymentInstructions: p.paymentInstructions || '',
          howToWin: Array.isArray(p.howToWin) ? p.howToWin : [],
          repostUrl: p.repostUrl || '',
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
    if (!confirm(`Delete the team ${m.teamA || 'this team'}?`)) return
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

  // Pick shape is now a single champion: { teamId, team }. Prefer the stored
  // team name, falling back to a lookup in the current team list.
  const pickTeam = (pick) => {
    if (pick?.team) return pick.team
    const m = matches.find((x) => x.id === pick?.teamId)
    return m ? m.teamA || 'Team' : 'their pick'
  }
  const championOf = (p) => pickTeam(Array.isArray(p.picks) ? p.picks[0] : null)

  // Mirror of the server's toWhatsAppNumber (server/src/whatsapp.js): digits-only
  // international form, defaulting local Lebanese numbers to +961.
  const toWhatsAppNumber = (mobile, cc = '961') => {
    let d = String(mobile || '').replace(/\D/g, '')
    if (!d) return ''
    if (d.startsWith(cc) && d.length >= cc.length + 7) return d
    return cc + d.replace(/^0+/, '')
  }

  // Open WhatsApp (web or app) with a pre-filled recap of the entry's predictions.
  function sendPrediction(p) {
    const number = toWhatsAppNumber(p.mobile)
    if (!number) {
      setMsg({ kind: 'error', text: `No valid mobile number on ${p.fullName}'s entry.` })
      return
    }
    const firstName = (p.fullName || '').trim().split(/\s+/)[0] || 'there'
    const drawLine = p.drawNumber != null ? `\n\nYour draw number: ${formatDraw(p.drawNumber)} — keep it safe!` : ''
    const text = [
      `Hello ${firstName}! ⚽`,
      '',
      'Thank you for taking part in the AS Company World Cup 2026 draw. We’re pleased to confirm your pick to win the World Cup:',
      '',
      `🏆 ${championOf(p)}${drawLine}`,
      '',
      'Good luck — we’ll be in touch if you’re our lucky winner! 🏆',
      '',
      'Best regards,',
      'The AS Company Team',
    ].join('\n')
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="World Cup Predictor"
        description="Run the draw: set the prize, add the teams players can pick from, and collect entries."
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {/* Settings + prize */}
      <form onSubmit={saveSettings} className="space-y-6">
        <Card title="Game & prize">
          <div className="space-y-4">
            <Toggle
              checked={settings.enabled}
              onChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
              label={settings.enabled ? 'Game is live' : 'Game is off'}
              description="When on (and at least one team exists), the animated football appears in the nav bar."
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
              description="Send each player a WhatsApp confirming their predictions. Requires the WhatsApp number to be configured on the server."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title"><TextInput value={settings.title} onChange={setS('title')} placeholder="Predict & Win — World Cup 2026" /></Field>
              <Field label="Subtitle"><TextInput value={settings.subtitle} onChange={setS('subtitle')} placeholder="Pick the World Cup winner to enter the draw." /></Field>
            </div>
            <Field label="Intro text"><TextArea value={settings.intro} onChange={setS('intro')} placeholder="Pick the team you think will lift the trophy to join the draw…" /></Field>
            <Field label="Post to repost (link)" hint="Link to the Instagram/social post players must repost to enter. Shown as the first step of the game. Leave empty to link to the @ascompany.lb profile.">
              <TextInput value={settings.repostUrl} onChange={setS('repostUrl')} placeholder="https://www.instagram.com/p/…" />
            </Field>
            <Field label="Submission deadline (optional)" hint="After this time, entries are automatically closed.">
              <TextInput type="datetime-local" value={settings.deadline} onChange={setS('deadline')} />
            </Field>
            <Field label="Success message" hint="Shown after a visitor submits their predictions.">
              <TextArea value={settings.successMessage} onChange={setS('successMessage')} placeholder="Your predictions are in! Good luck…" />
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
                <Field label="Prize title"><TextInput value={settings.prizeTitle} onChange={setS('prizeTitle')} placeholder="e.g. iPhone 16 Pro" /></Field>
                <Field label="Prize description"><TextArea value={settings.prizeDescription} onChange={setS('prizeDescription')} placeholder="What the lucky winner takes home." /></Field>
                <Field label="Prize image (optional)">
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

        <Card title="Auto-popup">
          <div className="space-y-4">
            <Toggle
              checked={settings.autoOpen}
              onChange={(v) => setSettings((s) => ({ ...s, autoOpen: v }))}
              label={settings.autoOpen ? 'Auto-popup ON' : 'Auto-popup OFF'}
              description="When on, the game opens on its own once per visit — visitors don't have to tap the football."
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

      {/* Teams players can pick from */}
      <Card
        title="Teams"
        actions={!editing && <Button onClick={startNew} type="button">+ New team</Button>}
      >
        {editing && (
          <form onSubmit={saveMatch} className="mb-6 space-y-4 rounded-2xl border border-black/10 bg-as-charcoal/[0.02] p-4">
            <TeamPicker
              label="Team"
              code={form.teamACode} name={form.teamA} flag={form.teamAFlag}
              onCode={(code, name) => setForm((f) => ({ ...f, teamACode: code, teamA: name || f.teamA }))}
              onName={(v) => setForm((f) => ({ ...f, teamA: v }))}
              onFlag={(v) => setForm((f) => ({ ...f, teamAFlag: v }))}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sort order"><TextInput type="number" value={form.sort} onChange={setF('sort')} /></Field>
            </div>
            <Toggle
              checked={form.visible}
              onChange={(v) => setForm((f) => ({ ...f, visible: v }))}
              label={form.visible ? 'Shown in the game' : 'Hidden'}
              description="Hide a team without deleting it."
            />
            <div className="flex gap-3">
              <Button type="submit" disabled={savingMatch}>{savingMatch ? 'Saving…' : 'Save team'}</Button>
              <Button type="button" variant="ghost" onClick={cancel}>Cancel</Button>
            </div>
          </form>
        )}

        {matches.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">No teams yet. Add the teams players can pick from to start the game.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {matches.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {flagUrl(m.teamACode, m.teamAFlag) && <img src={flagUrl(m.teamACode, m.teamAFlag)} alt="" className="h-6 w-9 rounded object-cover ring-1 ring-black/10" />}
                  <div className="min-w-0">
                    <p className="font-semibold text-as-charcoal">{m.teamA || 'Team'}</p>
                    <p className="truncate text-sm text-as-charcoal/55">
                      {m.visible === false ? 'hidden' : '—'}
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
          entriesTab === 'active' && activeEntries.length > 0 && (
            <Button variant="ghost" type="button" onClick={archiveAll}>Archive all</Button>
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
                    </p>
                    <p className="truncate text-sm text-as-charcoal/55">
                      {p.mobile} · 🏆 {championOf(p)} · {new Date(p.createdAt).toLocaleString('en-GB')}
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
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-as-charcoal/[0.03] p-3 text-sm">
                    <span className="text-as-charcoal/70">Pick to win the World Cup</span>
                    <span className="shrink-0 text-right font-bold text-as-charcoal">🏆 {championOf(p)}</span>
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
