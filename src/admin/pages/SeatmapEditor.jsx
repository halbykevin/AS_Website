import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { adminApi } from '../../lib/api.js'
import { Banner, Button, Card, Field, PageHeader, SaveBar, SegmentedControl, Select, TextInput, Toggle } from '../ui.jsx'
import {
  COLORS,
  cellKey,
  covers,
  generateHall,
  newId,
  overlaps,
  rectOf,
  rowLabels,
  summarize,
} from '../components/seatmapLayout.js'

// The seat map and tickets of an event AS Company hosts: draw the hall on a
// grid (seats, stage, entrances, standing areas), price it by ticket type, and
// keep what is sold up to date. Saved to /api/hosted-events/:id/seatmap; the
// ticketing hub draws the published one for visitors to pick from and request
// on WhatsApp. The server re-checks everything on save (hostedSeatmap.js).

const CELL = 26
const SOLD = '#BEBEBE'

const TOOLS = [
  { value: 'seat', label: 'Seats', hint: 'Click a cell to add or remove a seat, or drag to fill a block — in the ticket type picked below. Clicking a seat of another type re-prices it.' },
  { value: 'status', label: 'Sold / held', hint: 'Click or drag over seats to mark them sold, held (kept off sale — guests, crew) or available again.' },
  { value: 'stage', label: 'Stage', hint: 'Drag a rectangle where the stage is. Rows are lettered from the stage outwards: row A is nearest it.' },
  { value: 'entrance', label: 'Entrance', hint: 'Drag a rectangle for each door.' },
  { value: 'standing', label: 'Standing area', hint: 'Drag a rectangle for a standing or free-seating area, then set how many tickets it has.' },
  { value: 'select', label: 'Select', hint: 'Click a stage, entrance or area to rename, move, re-price or delete it.' },
  { value: 'erase', label: 'Erase', hint: 'Click or drag to remove seats and areas.' },
]
const MARKS = [
  { value: 'sold', label: 'Sold' },
  { value: 'held', label: 'Held' },
  { value: 'free', label: 'Available' },
]
const KIND_LABEL = { stage: 'Stage', entrance: 'Entrance', standing: 'Standing area' }

export default function SeatmapEditor() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [layout, setLayout] = useState(null)
  const [published, setPublished] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [history, setHistory] = useState([])
  const [tool, setTool] = useState('seat')
  const [tier, setTier] = useState('')
  const [mark, setMark] = useState('sold')
  const [selected, setSelected] = useState('')
  const [drag, setDrag] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const gridRef = useRef(null)
  // The drag lives in a ref as well as in state: a quick click releases before
  // React has re-rendered with the press, and the release must still see it.
  const dragRef = useRef(null)

  useEffect(() => {
    let alive = true
    adminApi
      .getSeatmap(id)
      .then((data) => {
        if (!alive) return
        setEvent(data.event)
        setLayout(data.layout)
        setPublished(data.published)
        setUpdatedAt(data.updatedAt)
        setTier(data.layout.tiers[0]?.id || '')
      })
      .catch((err) => alive && setLoadError(err?.message || 'Could not load the seat map.'))
    return () => {
      alive = false
    }
  }, [id])

  // Every edit goes through here, so it can be undone.
  const change = (next) => {
    setHistory((h) => [...h.slice(-49), layout])
    setLayout(next)
    setDirty(true)
  }
  const undo = () => {
    if (!history.length) return
    setLayout(history[history.length - 1])
    setHistory((h) => h.slice(0, -1))
    setDirty(true)
  }

  // Ctrl/Cmd+Z undoes; Delete removes the selected area — unless you're typing.
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault()
        removeArea(selected)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!dirty) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const labels = useMemo(() => (layout ? rowLabels(layout) : new Map()), [layout])
  const summary = useMemo(() => (layout ? summarize(layout) : null), [layout])
  // Seat numbers, 1… left to right within each row — what a ticket will say.
  const numbers = useMemo(() => {
    const out = new Map()
    if (!layout) return out
    const byRow = new Map()
    for (const s of layout.seats) byRow.set(s.r, [...(byRow.get(s.r) || []), s])
    for (const list of byRow.values()) {
      list.sort((a, b) => a.c - b.c).forEach((s, i) => out.set(cellKey(s.r, s.c), i + 1))
    }
    return out
  }, [layout])

  if (loadError) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Banner kind="error">{loadError}</Banner>
      </div>
    )
  }
  if (!layout) return <p className="text-sm text-as-charcoal/50">Loading…</p>

  if (event?.source) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Banner kind="warning">
          “{event.title}” comes from a ticketing site, which sells its seats — its map is read from there. Seat maps
          here are for events AS Company hosts.
        </Banner>
      </div>
    )
  }

  const tierById = new Map(layout.tiers.map((t) => [t.id, t]))
  const activeTier = tierById.get(tier) || layout.tiers[0]
  const area = layout.areas.find((a) => a.id === selected) || null
  const blocked = (r, c) => layout.areas.some((a) => covers(a, r, c))

  // ------------------------------------------------------------ drawing ---

  const cellAt = (e) => {
    const box = gridRef.current.getBoundingClientRect()
    const clamp = (v, max) => Math.max(0, Math.min(max, v))
    return {
      r: clamp(Math.floor((e.clientY - box.top) / CELL), layout.rows - 1),
      c: clamp(Math.floor((e.clientX - box.left) / CELL), layout.cols - 1),
    }
  }

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    gridRef.current.setPointerCapture(e.pointerId)
    const cell = cellAt(e)
    dragRef.current = { from: cell, to: cell }
    setDrag(dragRef.current)
  }
  const onPointerMove = (e) => {
    const current = dragRef.current
    if (!current) return
    const cell = cellAt(e)
    if (cell.r === current.to.r && cell.c === current.to.c) return
    dragRef.current = { ...current, to: cell }
    setDrag(dragRef.current)
  }
  const onPointerUp = () => {
    const done = dragRef.current
    if (!done) return
    dragRef.current = null
    setDrag(null)
    apply(rectOf(done.from, done.to))
  }

  function apply(rect) {
    const single = rect.w === 1 && rect.h === 1
    const inRect = (s) => covers(rect, s.r, s.c)

    if (tool === 'select') {
      const hit = [...layout.areas].reverse().find((a) => covers(a, rect.r, rect.c))
      setSelected(hit?.id || '')
      return
    }

    if (tool === 'seat') {
      const seats = new Map(layout.seats.map((s) => [cellKey(s.r, s.c), s]))
      if (single) {
        const k = cellKey(rect.r, rect.c)
        const seat = seats.get(k)
        if (seat && seat.tier === activeTier.id) seats.delete(k)
        else if (seat) seats.set(k, { ...seat, tier: activeTier.id })
        else if (!blocked(rect.r, rect.c)) seats.set(k, { r: rect.r, c: rect.c, tier: activeTier.id, status: 'free' })
        else return
      } else {
        for (let r = rect.r; r < rect.r + rect.h; r++) {
          for (let c = rect.c; c < rect.c + rect.w; c++) {
            if (blocked(r, c)) continue
            const seat = seats.get(cellKey(r, c))
            seats.set(cellKey(r, c), seat ? { ...seat, tier: activeTier.id } : { r, c, tier: activeTier.id, status: 'free' })
          }
        }
      }
      change({ ...layout, seats: [...seats.values()] })
      return
    }

    if (tool === 'status') {
      if (!layout.seats.some(inRect)) return
      change({ ...layout, seats: layout.seats.map((s) => (inRect(s) ? { ...s, status: mark } : s)) })
      return
    }

    if (tool === 'erase') {
      const seats = layout.seats.filter((s) => !inRect(s))
      const areas = layout.areas.filter((a) => !overlaps(a, rect))
      if (seats.length === layout.seats.length && areas.length === layout.areas.length) return
      if (!areas.some((a) => a.id === selected)) setSelected('')
      change({ ...layout, seats, areas })
      return
    }

    // stage / entrance / standing: a new rectangle, clearing the seats under it.
    const created = {
      id: newId('a', layout.areas.map((a) => a.id)),
      kind: tool,
      label: KIND_LABEL[tool].replace(' area', ''),
      ...rect,
      ...(tool === 'standing' ? { tier: activeTier.id, capacity: 0, sold: 0 } : {}),
    }
    change({ ...layout, seats: layout.seats.filter((s) => !inRect(s)), areas: [...layout.areas, created] })
    setSelected(created.id)
  }

  // ------------------------------------------------------------- editing ---

  const updateArea = (aid, patch) =>
    change({ ...layout, areas: layout.areas.map((a) => (a.id === aid ? { ...a, ...patch } : a)) })

  function removeArea(aid) {
    change({ ...layout, areas: layout.areas.filter((a) => a.id !== aid) })
    setSelected('')
  }

  const setSize = (key, value) => {
    const n = Math.round(Number(value))
    if (!Number.isFinite(n)) return
    const cols = key === 'cols' ? Math.max(4, Math.min(80, n)) : layout.cols
    const rows = key === 'rows' ? Math.max(4, Math.min(60, n)) : layout.rows
    if (cols === layout.cols && rows === layout.rows) return
    change({
      ...layout,
      cols,
      rows,
      seats: layout.seats.filter((s) => s.r < rows && s.c < cols),
      areas: layout.areas
        .filter((a) => a.r < rows && a.c < cols)
        .map((a) => ({ ...a, w: Math.min(a.w, cols - a.c), h: Math.min(a.h, rows - a.r) })),
    })
  }

  const renameRow = (r) => {
    const current = layout.rowNames?.[r] || ''
    const name = window.prompt(
      `Name for this row — leave empty to letter it automatically (now “${labels.get(r)}”).`,
      current,
    )
    if (name === null) return
    const rowNames = { ...(layout.rowNames || {}) }
    if (name.trim()) rowNames[r] = name.trim().slice(0, 8)
    else delete rowNames[r]
    change({ ...layout, rowNames })
  }

  const updateTier = (tid, patch) =>
    change({ ...layout, tiers: layout.tiers.map((t) => (t.id === tid ? { ...t, ...patch } : t)) })

  const addTier = () => {
    const tid = newId('t', layout.tiers.map((t) => t.id))
    const color = COLORS.find((c) => !layout.tiers.some((t) => t.color === c)) || COLORS[layout.tiers.length % COLORS.length]
    change({ ...layout, tiers: [...layout.tiers, { id: tid, name: `Ticket ${layout.tiers.length + 1}`, price: 0, color }] })
    setTier(tid)
  }

  // Whatever was in this type moves to the first remaining one, so no seat is
  // ever left without a price.
  const removeTier = (tid) => {
    const rest = layout.tiers.filter((t) => t.id !== tid)
    if (!rest.length) return
    const used = layout.seats.some((s) => s.tier === tid) || layout.areas.some((a) => a.tier === tid)
    if (used && !confirm(`Seats and areas of this type will move to “${rest[0].name}”. Continue?`)) return
    change({
      ...layout,
      tiers: rest,
      seats: layout.seats.map((s) => (s.tier === tid ? { ...s, tier: rest[0].id } : s)),
      areas: layout.areas.map((a) => (a.tier === tid ? { ...a, tier: rest[0].id } : a)),
    })
    if (tier === tid) setTier(rest[0].id)
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const data = await adminApi.saveSeatmap(id, { layout, published })
      setLayout(data.layout)
      setPublished(data.published)
      setUpdatedAt(data.updatedAt)
      setDirty(false)
      setMsg({
        kind: 'success',
        text: event.published
          ? 'Saved — live on the ticketing hub.'
          : 'Saved. The event is still a draft — press Publish to put it live.',
      })
      return true
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
      return false
    } finally {
      setSaving(false)
    }
  }

  // The event itself: a draft is invisible everywhere until this. Unsaved map
  // changes are saved first, so what goes live is what is on screen.
  async function publishEvent(value) {
    const ask = value
      ? `Publish “${event.title}”? It goes live on the ticketing hub straight away${dirty ? ', with the changes on this page' : ''}.`
      : `Unpublish “${event.title}”? It disappears from the ticketing hub and the app until you publish it again.`
    if (!confirm(ask)) return
    if (value && dirty && !(await save())) return
    try {
      const res = await adminApi.publishEvent(event.id, value)
      setEvent((e) => ({ ...e, published: res.published }))
      setMsg({
        kind: 'success',
        text: !value
          ? `“${event.title}” is unpublished.`
          : res.hubRefreshed
            ? `“${event.title}” is live.`
            : `“${event.title}” is published — the ticketing hub shows it within 5 minutes.`,
      })
    } catch (err) {
      setMsg({ kind: 'error', text: (value ? 'Publish' : 'Unpublish') + ' failed: ' + (err?.message || 'error') })
    }
  }

  const togglePublished = (v) => {
    setPublished(v)
    setDirty(true)
  }

  const empty = !layout.seats.length && !layout.areas.some((a) => a.kind === 'standing')
  const preview = drag ? rectOf(drag.from, drag.to) : null
  const currency = layout.currency

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader
        title="Seat map & tickets"
        description={event ? event.title : ''}
        actions={
          <>
            <Button variant="ghost" onClick={undo} disabled={!history.length} className="px-4 py-2">
              Undo
            </Button>
            {event.published ? (
              <Button variant="ghost" onClick={() => publishEvent(false)} className="px-4 py-2">
                Unpublish
              </Button>
            ) : (
              <Button onClick={() => publishEvent(true)} disabled={saving} className="px-4 py-2">
                Publish event
              </Button>
            )}
          </>
        }
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Banner kind={event.published ? 'success' : 'warning'}>
        {event.published
          ? 'Live — this event is on the ticketing hub. Saved changes show there straight away.'
          : 'Draft — this event is not on the ticketing hub yet. Set up its tickets, then press Publish event.'}
      </Banner>

      <Card>
        <Toggle
          checked={published}
          onChange={togglePublished}
          label="Seat picking on the ticketing hub"
          description={
            empty
              ? 'Add seats or a standing area first — an empty map is not shown.'
              : 'Visitors pick seats or tickets on the event page and send the request to us on WhatsApp. Off = the page shows only the Reserve on WhatsApp button.'
          }
        />
      </Card>

      <Card title="Ticket types">
        <div className="space-y-2">
          {layout.tiers.map((t) => {
            const counts = summary.tiers.find((x) => x.id === t.id)
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 p-2">
                <input
                  type="color"
                  value={t.color}
                  onChange={(e) => updateTier(t.id, { color: e.target.value.toUpperCase() })}
                  className="h-9 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label={`Colour of ${t.name}`}
                />
                <div className="min-w-[10rem] flex-1">
                  <TextInput
                    value={t.name}
                    onChange={(e) => updateTier(t.id, { name: e.target.value })}
                    placeholder="VIP, Regular, Balcony…"
                    aria-label="Ticket type name"
                  />
                </div>
                <div className="w-32">
                  <TextInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={t.price}
                    onChange={(e) => updateTier(t.id, { price: e.target.value === '' ? 0 : Number(e.target.value) })}
                    aria-label={`Price of ${t.name}`}
                  />
                </div>
                <span className="w-36 text-xs text-as-charcoal/55">
                  {counts?.total || 0} tickets · {counts?.available || 0} available
                </span>
                <button
                  type="button"
                  onClick={() => removeTier(t.id)}
                  disabled={layout.tiers.length < 2}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-as-red transition hover:bg-as-red/5 disabled:opacity-30"
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={addTier} disabled={layout.tiers.length >= 12} className="px-4 py-2">
            + Add ticket type
          </Button>
          <label className="flex items-center gap-2 text-sm text-as-charcoal/70">
            Currency
            <select
              value={currency}
              onChange={(e) => change({ ...layout, currency: e.target.value })}
              className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
            >
              <option value="USD">USD ($)</option>
              <option value="LBP">LBP</option>
            </select>
          </label>
        </div>
      </Card>

      <QuickLayout
        tiers={layout.tiers}
        defaultTier={activeTier.id}
        onGenerate={(opts) => {
          if (!empty && !confirm('Replace the current map with a new layout? (Undo brings it back.)')) return
          change({ ...layout, ...generateHall(opts), rowNames: {} })
          setSelected('')
        }}
      />

      <Card title="Map">
        <div className="space-y-3">
          <SegmentedControl value={tool} onChange={(v) => { setTool(v); if (v !== 'select') setSelected('') }} options={TOOLS} />
          <p className="text-xs text-as-charcoal/55">{TOOLS.find((t) => t.value === tool)?.hint}</p>

          {(tool === 'seat' || tool === 'standing') && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-as-charcoal/45">Ticket type</span>
              {layout.tiers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTier(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                    t.id === activeTier.id ? 'bg-as-charcoal text-white ring-as-charcoal' : 'bg-white text-as-charcoal/75 ring-black/10'
                  }`}
                >
                  <span className="h-3 w-3 rounded-[3px]" style={{ background: t.color }} />
                  {t.name} · {formatMoney(t.price, currency)}
                </button>
              ))}
            </div>
          )}
          {tool === 'status' && <SegmentedControl value={mark} onChange={setMark} options={MARKS} />}

          <div className="flex flex-wrap items-center gap-4 text-sm text-as-charcoal/70">
            <label className="flex items-center gap-2">
              Columns
              <SizeInput value={layout.cols} min={4} max={80} onCommit={(v) => setSize('cols', v)} />
            </label>
            <label className="flex items-center gap-2">
              Rows
              <SizeInput value={layout.rows} min={4} max={60} onCommit={(v) => setSize('rows', v)} />
            </label>
            <Legend />
          </div>

          <div className="overflow-auto rounded-xl bg-as-charcoal/[0.02] p-3 ring-1 ring-black/10">
            <div className="flex w-max">
              {/* Row letters, as the hall will number them. Click one to name it yourself. */}
              <div className="shrink-0" style={{ width: 34 }}>
                {Array.from({ length: layout.rows }, (_, r) => (
                  <div key={r} className="flex items-center justify-end pr-2" style={{ height: CELL }}>
                    {labels.has(r) && (
                      <button
                        type="button"
                        onClick={() => renameRow(r)}
                        title="Rename this row"
                        className={`text-[11px] font-bold hover:text-as-red ${
                          layout.rowNames?.[r] ? 'text-as-red' : 'text-as-charcoal/50'
                        }`}
                      >
                        {labels.get(r)}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div
                ref={gridRef}
                role="application"
                aria-label="Seat map editor"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  dragRef.current = null
                  setDrag(null)
                }}
                className="relative cursor-crosshair select-none bg-white"
                style={{
                  width: layout.cols * CELL,
                  height: layout.rows * CELL,
                  touchAction: 'none',
                  backgroundImage:
                    'linear-gradient(to right, rgba(0,0,0,.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.06) 1px, transparent 1px)',
                  backgroundSize: `${CELL}px ${CELL}px`,
                }}
              >
                {layout.areas.map((a) => (
                  <AreaBox key={a.id} area={a} tier={tierById.get(a.tier)} selected={a.id === selected} currency={currency} />
                ))}
                {layout.seats.map((s) => (
                  <SeatDot key={cellKey(s.r, s.c)} seat={s} tier={tierById.get(s.tier)} num={numbers.get(cellKey(s.r, s.c))} />
                ))}
                {preview && (
                  <div
                    className="pointer-events-none absolute rounded-md border-2 border-dashed border-as-red bg-as-red/10"
                    style={{ left: preview.c * CELL, top: preview.r * CELL, width: preview.w * CELL, height: preview.h * CELL }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {area && (
        <AreaInspector
          area={area}
          layout={layout}
          currency={currency}
          onChange={(patch) => updateArea(area.id, patch)}
          onRemove={() => removeArea(area.id)}
          onClose={() => setSelected('')}
        />
      )}

      <Card title="Tickets">
        <Summary summary={summary} currency={currency} />
      </Card>

      <SaveBar
        saving={saving}
        onSave={save}
        message={
          dirty
            ? 'Unsaved changes'
            : updatedAt
              ? `Saved ${new Date(updatedAt).toLocaleString()}`
              : 'Not saved yet'
        }
      />
    </div>
  )
}

// ------------------------------------------------------------------ parts ---

function BackLink() {
  return (
    <Link to="/admin/events" className="inline-flex text-sm font-medium text-as-charcoal/60 hover:text-as-red">
      ← Events
    </Link>
  )
}

function formatMoney(amount, currency) {
  const n = Number(amount) || 0
  const value = Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2)
  return currency === 'USD' ? `$${value}` : `${value} ${currency}`
}

function SeatDot({ seat, tier, num }) {
  const sold = seat.status === 'sold'
  const held = seat.status === 'held'
  const color = tier?.color || COLORS[0]
  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center rounded-[5px] text-[9px] font-bold leading-none"
      style={{
        left: seat.c * CELL + 3,
        top: seat.r * CELL + 3,
        width: CELL - 6,
        height: CELL - 6,
        background: sold ? SOLD : held ? 'white' : color,
        color: sold ? '#6B7280' : held ? color : 'white',
        boxShadow: held ? `inset 0 0 0 2px ${color}` : undefined,
      }}
      title={`${tier?.name || ''} · seat ${num}${sold ? ' · sold' : held ? ' · held' : ''}`}
    >
      {sold ? '×' : num}
    </div>
  )
}

function AreaBox({ area, tier, selected, currency }) {
  const base = 'pointer-events-none absolute flex flex-col items-center justify-center overflow-hidden rounded-md text-center leading-tight'
  const box = {
    left: area.c * CELL + 1,
    top: area.r * CELL + 1,
    width: area.w * CELL - 2,
    height: area.h * CELL - 2,
    // A door down the side of the hall is one column wide: run its name down it.
    ...(area.h > area.w * 1.5 ? { writingMode: 'vertical-rl' } : {}),
  }
  const ring = selected ? ' ring-2 ring-as-red ring-offset-1' : ''
  if (area.kind === 'stage') {
    return (
      <div className={`${base} bg-as-charcoal text-[10px] font-bold uppercase tracking-[0.25em] text-white${ring}`} style={box}>
        {area.label}
      </div>
    )
  }
  if (area.kind === 'entrance') {
    return (
      <div
        className={`${base} border-2 border-dashed border-emerald-600 bg-emerald-50 text-[9px] font-bold uppercase tracking-wider text-emerald-700${ring}`}
        style={box}
      >
        {area.label}
      </div>
    )
  }
  const color = tier?.color || COLORS[0]
  return (
    <div
      className={`${base} text-[10px] font-semibold${ring}`}
      style={{ ...box, background: `${color}1F`, border: `2px solid ${color}`, color }}
    >
      <span className="font-bold">{area.label}</span>
      {area.h > 1 && (
        <span className="opacity-80">
          {Math.max(0, area.capacity - area.sold)} / {area.capacity} · {formatMoney(tier?.price, currency)}
        </span>
      )}
    </div>
  )
}

function Legend() {
  return (
    <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-as-charcoal/55">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px] bg-as-red" /> available
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px] bg-white ring-2 ring-inset ring-as-red" /> held
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px]" style={{ background: SOLD }} /> sold
      </span>
    </span>
  )
}

/** A number box that only applies on blur or Enter — resizing mid-typing would drop seats. */
function SizeInput({ value, min, max, onCommit }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => onCommit(draft)
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      className="w-20 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
    />
  )
}

function AreaInspector({ area, layout, currency, onChange, onRemove, onClose }) {
  const num = (key, min, max) => (e) => {
    const n = Math.round(Number(e.target.value))
    if (Number.isFinite(n)) onChange({ [key]: Math.max(min, Math.min(max, n)) })
  }
  return (
    <Card
      title={KIND_LABEL[area.kind]}
      actions={
        <div className="flex gap-2">
          <Button variant="danger" onClick={onRemove} className="px-4 py-2">Delete</Button>
          <Button variant="ghost" onClick={onClose} className="px-4 py-2">Done</Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <TextInput value={area.label} onChange={(e) => onChange({ label: e.target.value })} maxLength={40} />
        </Field>
        {area.kind === 'standing' && (
          <Field label="Ticket type" hint="The price each ticket in this area is sold at.">
            <Select value={area.tier} onChange={(e) => onChange({ tier: e.target.value })}>
              {layout.tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {formatMoney(t.price, currency)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {area.kind === 'standing' && (
          <Field label="Tickets in this area" hint={area.capacity ? undefined : 'Set how many people it holds — at 0 it shows as not on sale.'}>
            <TextInput type="number" min="0" value={area.capacity} onChange={num('capacity', 0, 100000)} />
          </Field>
        )}
        {area.kind === 'standing' && (
          <Field label="Sold" hint={`${Math.max(0, area.capacity - area.sold)} still available.`}>
            <TextInput type="number" min="0" max={area.capacity} value={area.sold} onChange={num('sold', 0, area.capacity)} />
          </Field>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="From row">
          <TextInput type="number" min="1" value={area.r + 1} onChange={(e) => {
            const r = Math.round(Number(e.target.value)) - 1
            if (Number.isFinite(r)) onChange({ r: Math.max(0, Math.min(layout.rows - area.h, r)) })
          }} />
        </Field>
        <Field label="From column">
          <TextInput type="number" min="1" value={area.c + 1} onChange={(e) => {
            const c = Math.round(Number(e.target.value)) - 1
            if (Number.isFinite(c)) onChange({ c: Math.max(0, Math.min(layout.cols - area.w, c)) })
          }} />
        </Field>
        <Field label="Width">
          <TextInput type="number" min="1" value={area.w} onChange={num('w', 1, layout.cols - area.c)} />
        </Field>
        <Field label="Height">
          <TextInput type="number" min="1" value={area.h} onChange={num('h', 1, layout.rows - area.r)} />
        </Field>
      </div>
    </Card>
  )
}

function QuickLayout({ tiers, defaultTier, onGenerate }) {
  const [opts, setOpts] = useState({ rows: 10, perRow: 16, aisleEvery: 8, stage: 'top', entrance: 'bottom', tier: '' })
  const set = (k) => (e) => setOpts((o) => ({ ...o, [k]: e.target.value }))
  return (
    <details className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      <summary className="cursor-pointer text-lg font-bold text-as-charcoal">Quick layout</summary>
      <p className="mt-2 text-sm text-as-charcoal/55">
        Start from a whole hall — rows of seats, aisles, the stage and a door — then adjust it on the map.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Rows of seats"><TextInput type="number" min="1" max="40" value={opts.rows} onChange={set('rows')} /></Field>
        <Field label="Seats per row"><TextInput type="number" min="1" max="60" value={opts.perRow} onChange={set('perRow')} /></Field>
        <Field label="Aisle every … seats" hint="0 = no aisle."><TextInput type="number" min="0" max="60" value={opts.aisleEvery} onChange={set('aisleEvery')} /></Field>
        <Field label="Stage">
          <Select value={opts.stage} onChange={set('stage')}>
            <option value="top">In front (top)</option>
            <option value="bottom">Behind (bottom)</option>
            <option value="none">No stage</option>
          </Select>
        </Field>
        <Field label="Entrance">
          <Select value={opts.entrance} onChange={set('entrance')}>
            <option value="bottom">At the back</option>
            <option value="top">At the front</option>
            <option value="left">Left side</option>
            <option value="right">Right side</option>
            <option value="none">None</option>
          </Select>
        </Field>
        <Field label="Ticket type">
          <Select value={opts.tier || defaultTier} onChange={set('tier')}>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Button className="mt-4" onClick={() => onGenerate({ ...opts, tier: opts.tier || defaultTier })}>
        Generate
      </Button>
    </details>
  )
}

function Summary({ summary, currency }) {
  if (!summary.total) {
    return <p className="text-sm text-as-charcoal/50">No tickets yet — add seats or a standing area on the map.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-as-charcoal/45">
            <th className="py-2 pr-3 font-semibold">Ticket type</th>
            <th className="py-2 pr-3 font-semibold">Price</th>
            <th className="py-2 pr-3 text-right font-semibold">Tickets</th>
            <th className="py-2 pr-3 text-right font-semibold">Sold</th>
            <th className="py-2 pr-3 text-right font-semibold">Held</th>
            <th className="py-2 pr-3 text-right font-semibold">Available</th>
            <th className="py-2 text-right font-semibold">Sold value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {summary.tiers.filter((t) => t.total).map((t) => (
            <tr key={t.id}>
              <td className="py-2 pr-3">
                <span className="inline-flex items-center gap-2 font-medium text-as-charcoal">
                  <span className="h-3 w-3 rounded-[3px]" style={{ background: t.color }} />
                  {t.name}
                </span>
                {t.standing > 0 && (
                  <span className="ml-2 text-xs text-as-charcoal/45">
                    {t.seats ? `${t.seats} seats + ` : ''}{t.standing} standing
                  </span>
                )}
              </td>
              <td className="py-2 pr-3">{formatMoney(t.price, currency)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{t.total}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{t.sold}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{t.held}</td>
              <td className="py-2 pr-3 text-right font-semibold tabular-nums text-as-charcoal">{t.available}</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(t.sold * t.price, currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-black/10 font-semibold text-as-charcoal">
            <td className="py-2 pr-3" colSpan={2}>Total</td>
            <td className="py-2 pr-3 text-right tabular-nums">{summary.total}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{summary.sold}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{summary.held}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{summary.available}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(summary.soldValue, currency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
