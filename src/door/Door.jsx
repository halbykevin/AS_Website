import { useEffect, useMemo, useRef, useState } from 'react'
import { GATE, Offline, SignedOut, classify, doorClient, login, session, store } from './doorClient.js'
import { signal, startCamera, unlockSound } from './camera.js'

// The door scanner — www.as.com.lb/door, on a staff phone at the entrance.
//
// The door PIN (made in the event's seat map editor) opens one event. Then
// the camera reads each ticket's QR code and the whole screen answers: green
// ADMIT with the seat and the name to check, or red with why not. A ticket
// whose QR won't scan can be typed in by its number — looked up first, so the
// name is checked before anyone is admitted on a number printed in plain sight.
//
// Online, the server decides (server/src/door.js). If the signal drops, the
// phone decides from the guest list it keeps (doorClient.js), says OFFLINE on
// every answer, and syncs when it's back.

export default function Door() {
  const [current, setCurrent] = useState(() => session.get())
  const [notice, setNotice] = useState('')

  if (!current) {
    return (
      <DoorLogin
        notice={notice}
        onIn={(s) => {
          setNotice('')
          setCurrent(s)
        }}
      />
    )
  }
  return (
    <Scanner
      key={current.token}
      current={current}
      onOut={(message = '') => {
        session.clear()
        setNotice(message)
        setCurrent(null)
      }}
    />
  )
}

// ------------------------------------------------------------ PIN screen ---

function DoorLogin({ notice, onIn }) {
  const [pin, setPin] = useState('')
  const [gate, setGate] = useState(() => store.get(GATE, ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await login(pin, gate.trim())
      const s = { token: res.token, event: res.event, gate: res.gate, expiresAt: res.expiresAt, stats: res.stats }
      session.set(s)
      store.set(GATE, gate.trim())
      onIn(s)
    } catch (err) {
      setBusy(false)
      setError(err instanceof Offline ? 'No connection — the PIN has to be checked online once. Try again when there’s signal.' : err.message)
    }
  }

  return (
    <Screen>
      <form onSubmit={submit} className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-6 py-10">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-as-red-light">AS Ticketing</p>
        <h1 className="mt-2 text-3xl font-extrabold">Door scanner</h1>
        <p className="mt-2 text-sm text-white/60">Enter the door PIN for tonight’s event. Staff get it from the event’s page in the admin.</p>

        {(notice || error) && (
          <p className="mt-6 rounded-xl bg-as-red/20 px-4 py-3 text-sm font-semibold text-red-200">{error || notice}</p>
        )}

        <label className="mt-8 block">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Door PIN</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            minLength={6}
            placeholder="••••••"
            aria-label="Door PIN"
            className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-center font-mono text-4xl tracking-[0.4em] text-white outline-none placeholder:text-white/20 focus:border-as-red-light"
          />
        </label>
        <label className="mt-5 block">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Gate (optional)</span>
          <input
            value={gate}
            onChange={(e) => setGate(e.target.value.slice(0, 30))}
            placeholder="Main door, VIP entrance…"
            className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white outline-none placeholder:text-white/30 focus:border-as-red-light"
          />
        </label>
        <button
          type="submit"
          disabled={busy || pin.length !== 6}
          className="mt-8 rounded-full bg-as-red px-6 py-4 text-base font-bold text-white transition hover:bg-as-red-light disabled:opacity-40"
        >
          {busy ? 'Checking…' : 'Open the door'}
        </button>
      </form>
    </Screen>
  )
}

// --------------------------------------------------------------- scanner ---

const RESULTS = {
  admitted: { title: 'ADMIT', tone: 'bg-emerald-600', ok: true },
  already: { title: 'ALREADY USED', tone: 'bg-red-600' },
  void: { title: 'CANCELLED', tone: 'bg-red-700' },
  unknown: { title: 'NOT VALID', tone: 'bg-red-600' },
  other_event: { title: 'WRONG EVENT', tone: 'bg-amber-600' },
  conflict: { title: 'ADMITTED TWICE', tone: 'bg-red-700' },
  error: { title: 'COULDN’T CHECK', tone: 'bg-neutral-700' },
}

const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
const day = (date) =>
  date ? new Date(`${String(date).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''

/** The line under the big word: what the person at the door needs to know. */
function detail(r) {
  const t = r.ticket
  if (r.result === 'already') return `First scanned at ${clock(t?.checkedInAt)}${t?.checkedInGate ? ` · ${t.checkedInGate}` : ''}`
  if (r.result === 'void') return 'This booking was cancelled — don’t admit.'
  if (r.result === 'other_event') return `This ticket is for ${r.otherEvent?.title || 'another event'}${r.otherEvent?.date ? ` · ${day(r.otherEvent.date)}` : ''}.`
  if (r.result === 'unknown') {
    return r.offline
      ? `Not on this phone’s list${r.listAt ? ` (updated ${clock(r.listAt)})` : ''}. A booking made since then can be checked once the signal is back.`
      : 'This isn’t an AS Ticketing ticket.'
  }
  if (r.result === 'conflict') return 'Another gate let this ticket in while this phone was offline.'
  if (r.result === 'error') return r.message || ''
  return ''
}

function Scanner({ current, onOut }) {
  const client = useMemo(() => doorClient(current), [current])
  const [online, setOnline] = useState(true)
  const [stats, setStats] = useState(current.stats || client.offlineStats())
  const [queued, setQueued] = useState(() => client.queued())
  const [shown, setShown] = useState(null) // the result filling the screen
  const [recent, setRecent] = useState([])
  const [camera, setCamera] = useState('off') // off | starting | on | denied | none
  const [facing, setFacing] = useState('environment')
  const [typed, setTyped] = useState('')
  const [preview, setPreview] = useState(null) // a typed ticket number, looked up
  const [banner, setBanner] = useState('')

  const videoRef = useRef(null)
  const stopRef = useRef(null)
  const busy = useRef(false)
  const lastSeen = useRef({ text: '', at: 0 })
  const shownRef = useRef(null)
  const hideTimer = useRef(0)
  const listAt = useRef(0)

  const signOut = (message) => {
    stopRef.current?.()
    onOut(message)
  }

  function show(r) {
    const entry = { ...r, id: `${Date.now()}-${Math.random()}`, at: new Date().toISOString() }
    shownRef.current = entry
    setShown(entry)
    setRecent((list) => [entry, ...list].slice(0, 20))
    signal(r.result === 'admitted')
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(hide, r.result === 'admitted' ? 2200 : 4500)
  }
  function hide() {
    clearTimeout(hideTimer.current)
    shownRef.current = null
    setShown(null)
  }

  /** Decide a ticket: online if we can, from the phone's list if we can't. */
  async function decide(input) {
    let out
    try {
      out = input.code ? await client.scan(input.code) : await client.admitBySerial(input.serial)
      setOnline(true)
      if (out.ticket) client.remember(out.ticket)
      setStats(out.stats)
    } catch (err) {
      if (err instanceof SignedOut) return signOut(err.message)
      if (!(err instanceof Offline)) return show({ result: 'error', message: err.message })
      setOnline(false)
      out = await client.decideOffline(input)
      setStats(client.offlineStats())
      setQueued(client.queued())
    }
    show(out)
  }

  // Every frame with a code in it lands here. The same code is ignored for as
  // long as it stays in view, so a ticket held up a few seconds is read once.
  const onText = useRef(null)
  onText.current = (text) => {
    const now = Date.now()
    const seen = lastSeen.current
    if (seen.text === text && now - seen.at < 6000) {
      seen.at = now
      return
    }
    lastSeen.current = { text, at: now }
    if (shownRef.current || busy.current) return
    const input = classify(text)
    if (!input.code) return show({ result: 'unknown' })
    busy.current = true
    decide(input).finally(() => {
      busy.current = false
    })
  }

  async function startScanning(mode = facing) {
    unlockSound()
    stopRef.current?.()
    setCamera('starting')
    try {
      stopRef.current = await startCamera(videoRef.current, (t) => onText.current(t), { facingMode: mode })
      setCamera('on')
    } catch (err) {
      setCamera(err?.name === 'NotAllowedError' ? 'denied' : 'none')
    }
  }
  useEffect(() => () => stopRef.current?.(), [])

  // Every 15 seconds, and the moment the phone says it's back online: send
  // what was admitted offline, refresh the counts, and keep the guest list at
  // most a minute old — so it's fresh whenever the signal goes.
  useEffect(() => {
    let alive = true
    // One at a time: coming back online fires the 'online' event and the timer
    // together, and two syncs of one queue would report each admit as a clash.
    let beating = false
    async function heartbeat() {
      if (beating) return
      beating = true
      try {
        const synced = await client.sync()
        if (synced) {
          const problems = synced.results.filter((r) => r.result !== 'admitted')
          if (problems.length) {
            setRecent((list) => [
              ...problems.map((p) => ({ ...p, id: `${p.serial}-sync`, at: new Date().toISOString(), synced: true })),
              ...list,
            ])
            setBanner(`${problems.length} offline admit${problems.length > 1 ? 's' : ''} clashed when this phone synced — see below.`)
          }
        }
        if (Date.now() - listAt.current > 60_000) {
          const list = await client.refreshList()
          listAt.current = Date.now()
          if (alive) setStats(list.stats)
        } else {
          const state = await client.state()
          if (alive) setStats(state.stats)
        }
        if (alive) setOnline(true)
      } catch (err) {
        if (err instanceof SignedOut) return signOut(err.message)
        if (err instanceof Offline && alive) {
          setOnline(false)
          setStats(client.offlineStats())
        }
      } finally {
        beating = false
        if (alive) setQueued(client.queued())
      }
    }
    heartbeat()
    const timer = setInterval(heartbeat, 15_000)
    window.addEventListener('online', heartbeat)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('online', heartbeat)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  // A typed ticket number, or a handheld scanner "typing" a whole QR code.
  async function submitTyped(e) {
    e.preventDefault()
    const input = classify(typed)
    setTyped('')
    if (input.code) return decide(input)
    if (!input.serial) return show({ result: 'unknown' })
    try {
      const r = await client.lookup(input.serial)
      setOnline(true)
      setPreview({ ...r, serial: input.serial })
    } catch (err) {
      if (err instanceof SignedOut) return signOut(err.message)
      if (!(err instanceof Offline)) return show({ result: 'error', message: err.message })
      setOnline(false)
      setPreview({ ...(await client.decideOffline(input, { admit: false })), serial: input.serial })
    }
  }

  async function undo(entry) {
    const serial = entry.ticket?.serial
    if (!serial) return
    const mark = () => setRecent((list) => list.map((x) => (x.id === entry.id ? { ...x, undone: true } : x)))
    if (entry.offline && client.undoOffline(serial)) {
      mark()
      setStats(client.offlineStats())
      setQueued(client.queued())
      return
    }
    try {
      const r = await client.undo(serial)
      client.remember({ serial, checkedInAt: null })
      setStats(r.stats)
      mark()
    } catch (err) {
      if (err instanceof SignedOut) return signOut(err.message)
      setBanner(err instanceof Offline ? 'Undoing an admit needs a connection.' : err.message)
    }
    hide()
  }

  function end() {
    const pending = client.queued()
    const ask = pending
      ? `${pending} offline admit${pending > 1 ? 's haven’t' : ' hasn’t'} synced yet — they will the next time this phone opens this event’s door. End the session?`
      : 'End the door session on this phone?'
    if (confirm(ask)) signOut('')
  }

  const ev = current.event
  const pct = stats?.total ? Math.round((stats.admitted / stats.total) * 100) : 0

  return (
    <Screen>
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-4 pb-8 pt-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/40">
              Door{current.gate ? ` · ${current.gate}` : ''}
            </p>
            <h1 className="truncate text-lg font-extrabold">{ev.title}</h1>
            <p className="text-xs text-white/50">{[day(ev.date), ev.time, ev.venue].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/20 text-amber-200'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`} />
              {online ? 'Online' : 'Offline'}
              {queued ? ` · ${queued} to sync` : ''}
            </span>
            <button type="button" onClick={end} className="text-xs font-semibold text-white/40 hover:text-white">
              End session
            </button>
          </div>
        </header>

        <div className="mt-4 rounded-2xl bg-white/5 p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-4xl font-extrabold tabular-nums">
              {stats?.admitted ?? 0}
              <span className="text-xl font-bold text-white/40"> / {stats?.total ?? 0}</span>
            </p>
            <p className="text-sm font-semibold text-white/50">in · {pct}%</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {banner && (
          <button type="button" onClick={() => setBanner('')} className="mt-3 rounded-xl bg-amber-500/15 px-4 py-3 text-left text-sm font-semibold text-amber-200">
            {banner}
          </button>
        )}

        <div className="relative mt-4 aspect-square overflow-hidden rounded-3xl bg-black ring-1 ring-white/10">
          <video ref={videoRef} className={`h-full w-full object-cover ${camera === 'on' ? '' : 'opacity-0'}`} />
          {camera === 'on' ? (
            <>
              <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
              <button
                type="button"
                onClick={() => {
                  const next = facing === 'environment' ? 'user' : 'environment'
                  setFacing(next)
                  startScanning(next)
                }}
                className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-2 text-xs font-semibold text-white"
              >
                Switch camera
              </button>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
              {camera === 'denied' && (
                <p className="text-sm text-white/70">
                  The camera is blocked for this site. Allow it in the browser’s settings (the icon by the address bar), then try again.
                </p>
              )}
              {camera === 'none' && <p className="text-sm text-white/70">No camera here — type ticket numbers below, or use a handheld scanner.</p>}
              <button
                type="button"
                onClick={() => startScanning()}
                disabled={camera === 'starting'}
                className="rounded-full bg-as-red px-8 py-4 text-base font-bold text-white transition hover:bg-as-red-light disabled:opacity-50"
              >
                {camera === 'starting' ? 'Starting camera…' : 'Start scanning'}
              </button>
            </div>
          )}
        </div>

        <form onSubmit={submitTyped} className="mt-4 flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Ticket number, e.g. AST-K7M3Q9XP"
            autoCapitalize="characters"
            autoComplete="off"
            aria-label="Ticket number"
            className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 font-mono text-sm uppercase text-white outline-none placeholder:normal-case placeholder:text-white/30 focus:border-as-red-light"
          />
          <button type="submit" disabled={!typed.trim()} className="rounded-2xl bg-white/10 px-5 text-sm font-bold text-white disabled:opacity-40">
            Check
          </button>
        </form>

        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white/40">Last scans</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-white/40">Nothing scanned yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-white/5">
              {recent.map((r) => (
                <li key={r.id} className={`flex items-center gap-3 py-2.5 ${r.undone ? 'opacity-40' : ''}`}>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${RESULTS[r.result]?.ok ? 'bg-emerald-400' : r.result === 'other_event' ? 'bg-amber-400' : 'bg-red-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {r.undone ? 'Undone · ' : ''}
                      {RESULTS[r.result]?.title || r.result}
                      {r.ticket?.label ? ` · ${r.ticket.label}` : ''}
                    </p>
                    <p className="truncate text-xs text-white/45">
                      {[clock(r.at), r.ticket?.holder, r.offline ? 'offline' : '', r.synced ? 'on sync' : ''].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {r.result === 'admitted' && !r.undone && (
                    <button type="button" onClick={() => undo(r)} className="shrink-0 text-xs font-semibold text-white/50 hover:text-white">
                      Undo
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {preview && (
        <TypedTicket
          preview={preview}
          onAdmit={() => {
            const serial = preview.serial
            setPreview(null)
            decide({ serial })
          }}
          onClose={() => setPreview(null)}
        />
      )}
      {shown && <ResultScreen r={shown} onClose={hide} onUndo={() => undo(shown)} />}
    </Screen>
  )
}

/** The whole screen answers, readable at arm's length in a dark doorway. */
function ResultScreen({ r, onClose, onUndo }) {
  const look = RESULTS[r.result] || RESULTS.error
  const t = r.ticket
  return (
    <div
      role="alertdialog"
      aria-label={look.title}
      onClick={onClose}
      className={`fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center px-8 text-center text-white ${look.tone}`}
    >
      <p className="text-6xl" aria-hidden="true">
        {look.ok ? '✓' : '✕'}
      </p>
      <p className="mt-3 text-5xl font-black tracking-tight">{look.title}</p>
      {t?.label && <p className="mt-6 text-3xl font-extrabold">{t.label}</p>}
      {t?.section && <p className="mt-1 text-lg font-semibold opacity-80">{t.section}</p>}
      {t?.holder && <p className="mt-4 text-2xl font-bold">{t.holder}</p>}
      {detail(r) && <p className="mt-4 max-w-sm text-base font-medium opacity-90">{detail(r)}</p>}
      {r.offline && <p className="mt-5 rounded-full bg-black/25 px-3 py-1 text-xs font-bold uppercase tracking-wider">Offline — will sync</p>}
      {r.result === 'admitted' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onUndo()
          }}
          className="mt-8 rounded-full bg-black/25 px-5 py-2 text-sm font-semibold"
        >
          Undo
        </button>
      )}
      <p className="absolute bottom-6 text-xs font-semibold opacity-60">Tap to continue</p>
    </div>
  )
}

/** A ticket number typed in: who it belongs to, before anyone is let in on it. */
function TypedTicket({ preview, onAdmit, onClose }) {
  const t = preview.ticket
  const canAdmit = preview.result === 'found'
  const look = RESULTS[preview.result]
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-neutral-900 p-6 ring-1 ring-white/10">
        <p className="font-mono text-xs text-white/50">{preview.serial}</p>
        {canAdmit ? (
          <>
            <p className="mt-2 text-2xl font-extrabold">{t.label}</p>
            {t.section && <p className="text-sm text-white/60">{t.section}</p>}
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-white/40">Booked by</p>
            <p className="text-xl font-bold">{t.holder}</p>
            <p className="mt-4 text-sm text-white/60">A typed number proves nothing on its own — check the name before admitting.</p>
          </>
        ) : (
          <>
            <p className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold ${look?.tone || 'bg-red-600'}`}>{look?.title || 'NOT VALID'}</p>
            {t?.label && <p className="mt-3 text-xl font-extrabold">{t.label}</p>}
            {t?.holder && <p className="text-base font-semibold text-white/80">{t.holder}</p>}
            <p className="mt-3 text-sm text-white/60">{detail(preview) || 'No ticket with that number.'}</p>
          </>
        )}
        <div className="mt-6 flex gap-3">
          {canAdmit && (
            <button type="button" onClick={onAdmit} className="flex-1 rounded-full bg-emerald-600 py-3 text-base font-bold text-white">
              Admit
            </button>
          )}
          <button type="button" onClick={onClose} className="flex-1 rounded-full bg-white/10 py-3 text-base font-bold text-white">
            {canAdmit ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Screen({ children }) {
  return <main className="min-h-[100dvh] bg-neutral-950 text-white antialiased">{children}</main>
}
