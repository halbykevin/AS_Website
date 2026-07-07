import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { COUNTRIES, flagUrl, countryName } from '../../lib/flags.js'
import { Card, Field, TextInput, TextArea, Toggle, Button, Banner, PageHeader, SaveBar } from '../ui.jsx'

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
  howToWin: [],
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
    if (!confirm(`Delete the match ${m.teamA || 'Team A'} vs ${m.teamB || 'Team B'}?`)) return
    await adminApi.deletePredictorMatch(m.id)
    await load()
  }

  async function removePrediction(p) {
    if (!confirm(`Delete ${p.fullName}'s entry?`)) return
    await adminApi.deletePrediction(p.id)
    setPredictions((list) => list.filter((x) => x.id !== p.id))
  }

  const matchLabel = (id) => {
    const m = matches.find((x) => x.id === id)
    return m ? `${m.teamA || 'A'} vs ${m.teamB || 'B'}` : `Match #${id}`
  }

  // New pick shape: { matchId, btts:'yes'|'no', qualifier:'A'|'B' }.
  const bttsLabel = (pick) => (pick.btts === 'yes' ? 'Yes' : pick.btts === 'no' ? 'No' : '—')
  const qualifierName = (pick) => {
    const m = matches.find((x) => x.id === pick.matchId)
    if (!m) return pick.qualifier === 'A' ? 'Team A' : pick.qualifier === 'B' ? 'Team B' : '—'
    return pick.qualifier === 'A' ? m.teamA || 'Team A' : pick.qualifier === 'B' ? m.teamB || 'Team B' : '—'
  }

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
    const picks = p.picks
      .map((pick) => `• ${matchLabel(pick.matchId)} — BTTS ${bttsLabel(pick)}, ${qualifierName(pick)} qualify`)
      .join('\n')
    const text = [
      `Hello ${firstName}! ⚽`,
      '',
      'Thank you for taking part in the AS Company World Cup 2026 Predictor. We’re pleased to confirm your predictions:',
      '',
      picks,
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
        description="Run the predictor game: set the prize & Whish entry payment, add matches, and collect entries."
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
              description="When on (and at least one match exists), the animated football appears in the nav bar."
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
              <Field label="Subtitle"><TextInput value={settings.subtitle} onChange={setS('subtitle')} placeholder="Call both-teams-to-score and who qualifies to win big." /></Field>
            </div>
            <Field label="Intro text"><TextArea value={settings.intro} onChange={setS('intro')} placeholder="For each match, pick both-teams-to-score and who qualifies…" /></Field>
            <Field label="“How to win” steps (one per line)" hint="Shown as numbered steps on the first screen of the game. Leave empty to use the default steps.">
              <TextArea
                value={(settings.howToWin || []).join('\n')}
                onChange={(e) => setSettings((s) => ({ ...s, howToWin: e.target.value.split('\n') }))}
                placeholder={'Follow @ascompany.lb on Instagram.\nFor each match, predict both teams to score & who qualifies.\nPay $5 on Whish to AS Company to enter.\nPredict & Win iPhone 17e.'}
              />
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

        <Card title="Entry payment (Whish)">
          <div className="space-y-4">
            <Toggle
              checked={settings.paymentEnabled}
              onChange={(v) => setSettings((s) => ({ ...s, paymentEnabled: v }))}
              label={settings.paymentEnabled ? 'Payment required to enter' : 'No payment — free entry'}
              description="When on, players must confirm a Whish payment before they can submit their predictions."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Entry fee (USD)" hint="Shown to players, e.g. 5.">
                <TextInput type="number" min="0" step="0.5" value={settings.entryFee} onChange={setS('entryFee')} placeholder="5" />
              </Field>
              <Field label="Whish recipient / business name" hint="What players search for in the Whish app.">
                <TextInput value={settings.paymentRecipient} onChange={setS('paymentRecipient')} placeholder="AS Company" />
              </Field>
            </div>
            <Field label="Payment note" hint="Players add this note to their payment so you can match their entry.">
              <TextInput value={settings.paymentNote} onChange={setS('paymentNote')} placeholder="#as.com.lb" />
            </Field>
            <Field label="Extra instructions (optional)">
              <TextArea value={settings.paymentInstructions} onChange={setS('paymentInstructions')} placeholder="Any extra note shown on the payment step." />
            </Field>
          </div>
        </Card>

        <SaveBar saving={savingSettings} label="Save game settings" />
      </form>

      {/* Matches */}
      <Card
        title="Matches"
        actions={!editing && <Button onClick={startNew} type="button">+ New match</Button>}
      >
        {editing && (
          <form onSubmit={saveMatch} className="mb-6 space-y-4 rounded-2xl border border-black/10 bg-as-charcoal/[0.02] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Stage / group (optional)"><TextInput value={form.stage} onChange={setF('stage')} placeholder="Group A · Round of 16" /></Field>
              <Field label="Kick-off (optional)"><TextInput type="datetime-local" value={form.kickoff} onChange={setF('kickoff')} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TeamPicker
                label="Team A"
                code={form.teamACode} name={form.teamA} flag={form.teamAFlag}
                onCode={(code, name) => setForm((f) => ({ ...f, teamACode: code, teamA: name || f.teamA }))}
                onName={(v) => setForm((f) => ({ ...f, teamA: v }))}
                onFlag={(v) => setForm((f) => ({ ...f, teamAFlag: v }))}
              />
              <TeamPicker
                label="Team B"
                code={form.teamBCode} name={form.teamB} flag={form.teamBFlag}
                onCode={(code, name) => setForm((f) => ({ ...f, teamBCode: code, teamB: name || f.teamB }))}
                onName={(v) => setForm((f) => ({ ...f, teamB: v }))}
                onFlag={(v) => setForm((f) => ({ ...f, teamBFlag: v }))}
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
          <p className="text-sm text-as-charcoal/50">No matches yet. Add one to start the game.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {matches.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    {flagUrl(m.teamACode, m.teamAFlag) && <img src={flagUrl(m.teamACode, m.teamAFlag)} alt="" className="h-6 w-9 rounded object-cover ring-1 ring-black/10" />}
                    <span className="text-xs font-bold text-as-charcoal/40">vs</span>
                    {flagUrl(m.teamBCode, m.teamBFlag) && <img src={flagUrl(m.teamBCode, m.teamBFlag)} alt="" className="h-6 w-9 rounded object-cover ring-1 ring-black/10" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-as-charcoal">{m.teamA || 'Team A'} vs {m.teamB || 'Team B'}</p>
                    <p className="truncate text-sm text-as-charcoal/55">
                      {[m.stage, m.visible === false ? 'hidden' : null].filter(Boolean).join(' · ') || '—'}
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
      <Card title={`Entries (${predictions.length})`}>
        {predictions.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">No entries yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {predictions.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-as-charcoal">{p.fullName}</p>
                    <p className="truncate text-sm text-as-charcoal/55">
                      {p.mobile} · {p.picks.length} picks · {new Date(p.createdAt).toLocaleString('en-GB')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="ghost" type="button" className="px-3 py-1.5" onClick={() => sendPrediction(p)}>Send</Button>
                    <Button variant="ghost" type="button" className="px-3 py-1.5" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      {expanded === p.id ? 'Hide' : 'View'}
                    </Button>
                    <Button variant="danger" type="button" className="px-3 py-1.5" onClick={() => removePrediction(p)}>Delete</Button>
                  </div>
                </div>
                {expanded === p.id && (
                  <ul className="mt-3 grid gap-1.5 rounded-xl bg-as-charcoal/[0.03] p-3 text-sm sm:grid-cols-2">
                    {p.picks.map((pick, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span className="truncate text-as-charcoal/70">{matchLabel(pick.matchId)}</span>
                        <span className="shrink-0 text-right font-bold text-as-charcoal">
                          BTTS {bttsLabel(pick)} · {qualifierName(pick)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
