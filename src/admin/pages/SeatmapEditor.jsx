import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { adminApi, downloadBookingTickets, downloadTicketPreview } from '../../lib/api.js'
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
// ticketing hub draws the published one for visitors to book from. The server
// re-checks everything on save (hostedSeatmap.js).
//
// Staff also sell here, in person: the "Sell at counter" tool picks seats on
// the map and issues their tickets as a PDF to print (bookings.js, tickets.js).

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
  { value: 'sell', label: 'Sell at counter', hint: 'For someone buying in person at AS Company: click their seats (or drag over a block) — free ones, or ones you already marked sold or held — then fill in their name below. They pay cash, and the tickets download ready to print.' },
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
  // What visitors have booked: seat id -> 'reserved' | 'paid', standing area
  // id -> { reserved, paid }, and the bookings themselves. Read from the
  // server, never edited here — a booked seat is managed from its booking.
  const [booked, setBooked] = useState({})
  const [bookedZones, setBookedZones] = useState({})
  const [bookings, setBookings] = useState([])
  // Seats picked with "Sell at counter" — a sale in the making, not an edit.
  const [sale, setSale] = useState(() => new Set())
  // The printed ticket's picture and Arabic venue name; saved with the map.
  const [ticket, setTicket] = useState({ imageUrl: '', venueAr: '' })
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
        setBooked(data.booked || {})
        setBookedZones(data.bookedZones || {})
        setTier(data.layout.tiers[0]?.id || '')
        setTicket(data.ticket || { imageUrl: '', venueAr: '' })
      })
      .catch((err) => alive && setLoadError(err?.message || 'Could not load the seat map.'))
    adminApi.listBookings(id).then((list) => alive && setBookings(list)).catch(() => {})
    return () => {
      alive = false
    }
  }, [id])

  // Bookings arrive while the page is open: refresh them, and which seats they
  // hold, every 30 seconds — without touching the map being edited.
  const refreshBookings = async () => {
    const [list, map] = await Promise.all([adminApi.listBookings(id), adminApi.getSeatmap(id)])
    setBookings(list)
    setBooked(map.booked || {})
    setBookedZones(map.bookedZones || {})
  }
  useEffect(() => {
    const t = setInterval(() => refreshBookings().catch(() => {}), 30_000)
    return () => clearInterval(t)
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
  const summary = useMemo(
    () => (layout ? summarize(layout, booked, bookedZones) : null),
    [layout, booked, bookedZones],
  )
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
    // A seat someone has booked is theirs: no tool moves, re-prices or frees it.
    const isBooked = (r, c) => Boolean(booked[cellKey(r, c)])
    const bookedIn = layout.seats.filter((s) => inRect(s) && isBooked(s.r, s.c))
    const sayBooked = () =>
      setMsg({ kind: 'warning', text: 'Booked seats can’t be changed here — manage them from their booking in Bookings below.' })

    if (tool === 'select') {
      const hit = [...layout.areas].reverse().find((a) => covers(a, rect.r, rect.c))
      setSelected(hit?.id || '')
      return
    }

    // Picking seats to sell changes nothing on the map: a click toggles one,
    // a drag adds a block. A seat a booking holds isn't for sale.
    if (tool === 'sell') {
      const keys = layout.seats.filter((s) => inRect(s) && !isBooked(s.r, s.c)).map((s) => cellKey(s.r, s.c))
      if (!keys.length) {
        if (bookedIn.length) setMsg({ kind: 'warning', text: 'That seat is already booked — see Bookings below.' })
        return
      }
      setSale((prev) => {
        const next = new Set(prev)
        if (single && next.has(keys[0])) next.delete(keys[0])
        else keys.forEach((k) => next.add(k))
        return next
      })
      return
    }

    if (tool === 'seat') {
      const seats = new Map(layout.seats.map((s) => [cellKey(s.r, s.c), s]))
      if (single) {
        const k = cellKey(rect.r, rect.c)
        const seat = seats.get(k)
        if (seat && isBooked(seat.r, seat.c)) return sayBooked()
        if (seat && seat.tier === activeTier.id) seats.delete(k)
        else if (seat) seats.set(k, { ...seat, tier: activeTier.id })
        else if (!blocked(rect.r, rect.c)) seats.set(k, { r: rect.r, c: rect.c, tier: activeTier.id, status: 'free' })
        else return
      } else {
        for (let r = rect.r; r < rect.r + rect.h; r++) {
          for (let c = rect.c; c < rect.c + rect.w; c++) {
            if (blocked(r, c) || isBooked(r, c)) continue
            const seat = seats.get(cellKey(r, c))
            seats.set(cellKey(r, c), seat ? { ...seat, tier: activeTier.id } : { r, c, tier: activeTier.id, status: 'free' })
          }
        }
      }
      change({ ...layout, seats: [...seats.values()] })
      return
    }

    if (tool === 'status') {
      const touch = (s) => inRect(s) && !isBooked(s.r, s.c)
      if (!layout.seats.some(touch)) return bookedIn.length ? sayBooked() : undefined
      change({ ...layout, seats: layout.seats.map((s) => (touch(s) ? { ...s, status: mark } : s)) })
      return
    }

    if (tool === 'erase') {
      const seats = layout.seats.filter((s) => !inRect(s) || isBooked(s.r, s.c))
      const areas = layout.areas.filter((a) => !overlaps(a, rect) || bookedZones[a.id])
      if (seats.length === layout.seats.length && areas.length === layout.areas.length) {
        return bookedIn.length ? sayBooked() : undefined
      }
      if (!areas.some((a) => a.id === selected)) setSelected('')
      change({ ...layout, seats, areas })
      return
    }

    // stage / entrance / standing: a new rectangle, clearing the seats under it
    // — never over booked ones.
    if (bookedIn.length) return sayBooked()
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
    if (bookedZones[aid]) {
      setMsg({ kind: 'warning', text: 'This standing area has bookings — cancel them in Bookings below before deleting it.' })
      return
    }
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
      // baseUpdatedAt: the version this page loaded. If someone saved since,
      // the server refuses rather than let this page undo their changes.
      const data = await adminApi.saveSeatmap(id, { layout, published, ticket, baseUpdatedAt: updatedAt })
      setLayout(data.layout)
      setPublished(data.published)
      setTicket(data.ticket)
      setUpdatedAt(data.updatedAt)
      setBooked(data.booked || {})
      setBookedZones(data.bookedZones || {})
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
  // The seats picked to sell, named as their tickets will name them. One that
  // gets booked online meanwhile simply drops out.
  const picked = layout.seats
    .filter((s) => sale.has(cellKey(s.r, s.c)) && !booked[cellKey(s.r, s.c)])
    .map((s) => ({ id: cellKey(s.r, s.c), r: s.r, row: labels.get(s.r), num: numbers.get(cellKey(s.r, s.c)), tier: s.tier, status: s.status }))
    .sort((a, b) => a.r - b.r || a.num - b.num)

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
        {/* The one place prices are set. A section is priced by giving it a
            ticket type and painting its seats in that type on the map. */}
        <p className="mb-3 text-sm text-as-charcoal/60">
          Each ticket type is a price. To price a section — say <strong>$30</strong> a seat — add a type for it here
          (name it, set its price), then on the map below pick that type under <em>Seats</em> and click its seats, or
          drag over the whole section at once. A standing area takes its price from the type you give it.
        </p>
        <div className="mb-1 hidden gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-as-charcoal/45 sm:flex">
          <span className="w-10">Colour</span>
          <span className="min-w-[10rem] flex-1">Name</span>
          <span className="w-32">Price ({layout.currency === 'USD' ? '$' : layout.currency})</span>
        </div>
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
                <label className="relative block w-32">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-as-charcoal/45">
                    {layout.currency === 'USD' ? '$' : 'LBP'}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={t.price}
                    onChange={(e) => updateTier(t.id, { price: e.target.value === '' ? 0 : Number(e.target.value) })}
                    aria-label={`Price of ${t.name}`}
                    className={`w-full rounded-lg border border-black/10 bg-white py-2.5 pr-3 text-sm text-as-charcoal outline-none transition focus:border-as-red focus:ring-2 focus:ring-as-red/20 ${
                      layout.currency === 'USD' ? 'pl-7' : 'pl-11'
                    }`}
                  />
                </label>
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
          if (Object.keys(booked).length || Object.keys(bookedZones).length) {
            setMsg({ kind: 'warning', text: 'This map has bookings, so it can’t be replaced — adjust it on the map instead.' })
            return
          }
          if (!empty && !confirm('Replace the current map with a new layout? (Undo brings it back.)')) return
          change({ ...layout, ...generateHall(opts), rowNames: {} })
          setSelected('')
        }}
      />

      <Card title="Map">
        <div className="space-y-3">
          <SegmentedControl
            value={tool}
            onChange={(v) => {
              setTool(v)
              if (v !== 'select') setSelected('')
              if (v !== 'sell') setSale(new Set())
            }}
            options={TOOLS}
          />
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
                  <SeatDot
                    key={cellKey(s.r, s.c)}
                    seat={s}
                    tier={tierById.get(s.tier)}
                    num={numbers.get(cellKey(s.r, s.c))}
                    booking={booked[cellKey(s.r, s.c)]}
                    picked={tool === 'sell' && sale.has(cellKey(s.r, s.c))}
                  />
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

      {tool === 'sell' && (
        <CounterSale
          eventId={id}
          layout={layout}
          picked={picked}
          bookedZones={bookedZones}
          dirty={dirty}
          onUnpick={(key) =>
            setSale((prev) => {
              const next = new Set(prev)
              next.delete(key)
              return next
            })
          }
          onSold={(text) => {
            setSale(new Set())
            setMsg({ kind: 'success', text })
            refreshBookings().catch(() => {})
          }}
          onError={(text) => setMsg({ kind: 'error', text })}
        />
      )}

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

      <PrintedTicket
        eventId={id}
        ticket={ticket}
        onChange={(next) => {
          setTicket(next)
          setDirty(true)
        }}
        onError={(text) => setMsg({ kind: 'error', text })}
      />

      <Bookings
        bookings={bookings}
        onChanged={(text) => {
          setMsg({ kind: 'success', text })
          refreshBookings().catch(() => {})
        }}
        onError={(text) => setMsg({ kind: 'error', text })}
      />

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

// A booking outranks the admin's own mark: reserved (awaiting payment) and
// paid seats are drawn as such whatever the seat's status says.
const RESERVED = '#F59E0B'
const PAID = '#383F41'

function SeatDot({ seat, tier, num, booking, picked }) {
  const sold = !booking && seat.status === 'sold'
  const held = !booking && seat.status === 'held'
  const color = tier?.color || COLORS[0]
  const fill = booking === 'paid' ? PAID : booking ? RESERVED : sold ? SOLD : held ? 'white' : color
  const state = booking === 'paid' ? ' · booked, paid' : booking ? ' · reserved, awaiting payment' : sold ? ' · sold' : held ? ' · held' : ''
  // Picked to sell at the counter: ringed, whatever its colour.
  const rings = [held && `inset 0 0 0 2px ${color}`, picked && '0 0 0 2px white, 0 0 0 4px #1C1C1C'].filter(Boolean)
  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center rounded-[5px] text-[9px] font-bold leading-none"
      style={{
        left: seat.c * CELL + 3,
        top: seat.r * CELL + 3,
        width: CELL - 6,
        height: CELL - 6,
        background: fill,
        color: sold ? '#6B7280' : held ? color : 'white',
        boxShadow: rings.length ? rings.join(', ') : undefined,
        zIndex: picked ? 1 : undefined,
      }}
      title={`${tier?.name || ''} · seat ${num}${state}${picked ? ' · picked to sell' : ''}`}
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
        className={`${base} border-2 border-dashed border-emerald-600 bg-emerald-50 text-[8px] font-bold uppercase text-emerald-700${ring}`}
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
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px]" style={{ background: RESERVED }} /> reserved
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px]" style={{ background: PAID }} /> booked &amp; paid
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
            <th className="py-2 pr-3 text-right font-semibold">Reserved</th>
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
              <td className="py-2 pr-3 text-right tabular-nums">{t.reserved}</td>
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
            <td className="py-2 pr-3 text-right tabular-nums">{summary.reserved}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{summary.held}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{summary.available}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(summary.soldValue, currency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ------------------------------------------------------------ the counter ---

/**
 * Someone buying in person at AS Company: the seats picked on the map, any
 * standing places, and who they are. Paid in cash there and then — the
 * booking is made paid, its tickets download as one PDF to print, and an email
 * (if given) gets them too. Sold from the saved map, so unsaved edits wait.
 */
function CounterSale({ eventId, layout, picked, bookedZones, dirty, onUnpick, onSold, onError }) {
  const [form, setForm] = useState({ name: '', mobile: '', email: '' })
  const [qty, setQty] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const tiers = new Map(layout.tiers.map((t) => [t.id, t]))
  const currency = layout.currency
  const standing = layout.areas.filter((a) => a.kind === 'standing' && a.capacity > 0)
  const left = (a) => {
    const z = bookedZones[a.id] || {}
    return Math.max(0, a.capacity - a.sold - (z.reserved || 0) - (z.paid || 0))
  }
  const zones = standing
    .map((a) => ({ id: a.id, qty: Math.min(Math.max(0, Math.floor(Number(qty[a.id]) || 0)), left(a)), price: tiers.get(a.tier)?.price || 0 }))
    .filter((z) => z.qty > 0)
  const count = picked.length + zones.reduce((n, z) => n + z.qty, 0)
  const total = picked.reduce((n, s) => n + (tiers.get(s.tier)?.price || 0), 0) + zones.reduce((n, z) => n + z.qty * z.price, 0)

  async function sell(e) {
    e.preventDefault()
    const name = form.name.trim()
    if (!confirm(`Sell ${count} ticket${count > 1 ? 's' : ''} to ${name} for ${formatMoney(total, currency)}, paid in cash?`)) return
    setBusy(true)
    try {
      const booking = await adminApi.counterSale(eventId, {
        ...form,
        seats: picked.map((s) => s.id),
        zones: zones.map(({ id, qty }) => ({ id, qty })),
      })
      setForm({ name: '', mobile: '', email: '' })
      setQty({})
      const printed = await downloadBookingTickets(booking).then(
        () => true,
        () => false,
      )
      onSold(
        `${booking.code} — ${count} ticket${count > 1 ? 's' : ''} sold to ${booking.name}. ` +
          (printed ? 'The tickets have downloaded — print them for the customer.' : 'Download its tickets from Bookings below.') +
          (booking.email ? ` They're emailed to ${booking.email} too.` : ''),
      )
    } catch (err) {
      onError(err?.message || 'The sale didn’t go through.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Sell at the counter">
      <form onSubmit={sell} className="space-y-4">
        {dirty && <Banner kind="warning">Save your map changes first — tickets are sold from the saved map.</Banner>}

        {picked.length ? (
          <div className="flex flex-wrap gap-2">
            {picked.map((s) => {
              const t = tiers.get(s.tier)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onUnpick(s.id)}
                  title="Remove from this sale"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-as-charcoal ring-1 ring-black/15 transition hover:ring-as-red/40"
                >
                  <span className="h-3 w-3 rounded-[3px]" style={{ background: t?.color }} />
                  {s.row}
                  {s.num} · {t?.name} · {formatMoney(t?.price, currency)}
                  {s.status !== 'free' && <span className="font-normal text-as-charcoal/50">(marked {s.status})</span>}
                  <span className="text-as-charcoal/40">×</span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-as-charcoal/55">
            Click the customer’s seats on the map above{standing.length ? ', or add standing tickets below' : ''}.
          </p>
        )}

        {standing.length > 0 && (
          <div className="space-y-2">
            {standing.map((a) => {
              const t = tiers.get(a.tier)
              return (
                <label key={a.id} className="flex flex-wrap items-center gap-3 text-sm text-as-charcoal">
                  <span className="min-w-[10rem] font-semibold">{a.label}</span>
                  <span className="text-as-charcoal/55">
                    {formatMoney(t?.price, currency)} · {left(a)} left
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={left(a)}
                    value={qty[a.id] ?? ''}
                    placeholder="0"
                    onChange={(e) => setQty((q) => ({ ...q, [a.id]: e.target.value }))}
                    className="w-20 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
                    aria-label={`${a.label} tickets`}
                  />
                </label>
              )
            })}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Customer’s name" hint="Printed on every ticket.">
            <TextInput required minLength={2} maxLength={80} value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Mobile" hint="Optional.">
            <TextInput type="tel" value={form.mobile} onChange={set('mobile')} placeholder="03 123 456" />
          </Field>
          <Field label="Email" hint="Optional — they get the tickets there too.">
            <TextInput type="email" value={form.email} onChange={set('email')} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-4">
          <p className="text-sm text-as-charcoal">
            {count ? (
              <>
                {count} ticket{count > 1 ? 's' : ''} · <strong>{formatMoney(total, currency)}</strong> in cash
              </>
            ) : (
              <span className="text-as-charcoal/50">Nothing picked yet.</span>
            )}
          </p>
          <Button type="submit" disabled={busy || dirty || !count} className="px-5 py-2.5">
            {busy ? 'Issuing…' : 'Sell & download tickets'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

/**
 * The event's printed ticket: the picture in its left panel and the venue's
 * Arabic name. Everything else on it comes from the event and the seat.
 */
function PrintedTicket({ eventId, ticket, onChange, onError }) {
  const [uploading, setUploading] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  async function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const up = await adminApi.upload(file)
      onChange({ ...ticket, imageUrl: up.url })
    } catch (err) {
      onError('Upload failed: ' + (err?.message || 'error'))
    } finally {
      setUploading(false)
    }
  }

  async function preview() {
    setPreviewing(true)
    try {
      await downloadTicketPreview(eventId, ticket)
    } catch (err) {
      onError('Preview failed: ' + (err?.message || 'error'))
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <Card
      title="Printed ticket"
      actions={
        <Button variant="ghost" onClick={preview} disabled={previewing} className="px-4 py-2">
          {previewing ? 'Preparing…' : 'Preview ticket'}
        </Button>
      }
    >
      <p className="mb-4 text-sm text-as-charcoal/60">
        Every paid booking gets one ticket per seat — a PDF with its own QR code, emailed to the customer, on their
        booking page, and under <em>Bookings</em> below to print. A reservation gets none until it is paid, and
        cancelling a booking cancels its tickets: scanned at the door, the code says whose ticket it is and whether it
        is still valid.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Picture" hint="The panel down the ticket’s left side. Empty = the event’s own picture. A tall poster fits best.">
          <div className="flex items-center gap-3">
            {ticket.imageUrl && (
              <img src={ticket.imageUrl} alt="" className="h-20 w-[3.2rem] rounded object-cover ring-1 ring-black/10" />
            )}
            <label className="cursor-pointer rounded-full px-4 py-2 text-sm font-semibold text-as-charcoal ring-1 ring-black/15 transition hover:text-as-red">
              {uploading ? 'Uploading…' : ticket.imageUrl ? 'Replace' : 'Upload'}
              <input type="file" accept="image/*" onChange={upload} disabled={uploading} className="hidden" />
            </label>
            {ticket.imageUrl && (
              <button
                type="button"
                onClick={() => onChange({ ...ticket, imageUrl: '' })}
                className="text-sm font-semibold text-as-charcoal/50 hover:text-as-red"
              >
                Use the event’s picture
              </button>
            )}
          </div>
        </Field>
        <Field label="Venue in Arabic" hint="Optional — printed in red beside the venue’s name.">
          <TextInput
            dir="rtl"
            maxLength={60}
            value={ticket.venueAr}
            onChange={(e) => onChange({ ...ticket, venueAr: e.target.value })}
            placeholder="مسرح ميلاد الغزال – زغرتا"
          />
        </Field>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- bookings ---

const BOOKING_VIEWS = [
  { value: 'reserved', label: 'Waiting for payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'closed', label: 'Expired & cancelled' },
  { value: 'all', label: 'All' },
]
const STATUS_STYLE = {
  reserved: 'bg-amber-100 text-amber-800',
  paid: 'bg-green-100 text-green-800',
  expired: 'bg-as-charcoal/10 text-as-charcoal/60',
  cancelled: 'bg-as-red/10 text-as-red',
}
const STATUS_LABEL = { reserved: 'Reserved', paid: 'Paid', expired: 'Expired', cancelled: 'Cancelled' }
const inView = (b, view) =>
  view === 'all' ? true : view === 'closed' ? b.status === 'expired' || b.status === 'cancelled' : b.status === view

const beirut = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        timeZone: 'Asia/Beirut', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : ''

function timeLeft(iso) {
  const ms = new Date(iso) - Date.now()
  if (ms <= 0) return 'time is up'
  const h = Math.floor(ms / 3.6e6)
  const m = Math.floor((ms % 3.6e6) / 6e4)
  return h ? `${h}h ${m}m left` : `${m}m left`
}

function bookingWhen(b) {
  if (b.status === 'reserved') {
    return `held until ${beirut(b.expiresAt)} (${timeLeft(b.expiresAt)})${b.onlineStarted ? ' · started paying online' : ''}`
  }
  if (b.status === 'paid') {
    const how = b.channel === 'counter' ? 'cash at the counter' : b.paymentMethod === 'whish' ? 'online (Whish)' : b.paymentMethod
    return `paid ${beirut(b.paidAt)} · ${how}`
  }
  if (b.status === 'expired') return `expired ${beirut(b.expiresAt)}`
  return `cancelled ${beirut(b.cancelledAt)}`
}

/**
 * Every booking made from this map. Staff take cash at the shop and mark it
 * paid here (the customer gives their code), cancel what won't be paid,
 * resend a lost email, and print a paid booking's tickets. Seats come back on
 * sale the moment a booking is cancelled or its 24 hours run out.
 */
function Bookings({ bookings, onChanged, onError }) {
  const waiting = bookings.filter((b) => b.status === 'reserved').length
  const [view, setView] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(0)
  const current = view || (waiting ? 'reserved' : 'all')

  const needle = q.trim().toLowerCase().replace(/[\s-]+/g, '')
  const digits = needle.replace(/\D/g, '')
  const matches = (b) =>
    !needle ||
    b.code.toLowerCase().replace(/-/g, '').includes(needle) ||
    b.name.toLowerCase().replace(/\s+/g, '').includes(needle) ||
    (digits.length >= 3 && b.mobile.includes(digits)) ||
    b.email.toLowerCase().includes(needle)
  const shown = bookings.filter((b) => inView(b, current) && matches(b))

  async function act(b, kind) {
    const ask = {
      paid: `Mark ${b.code} as paid in cash (${formatMoney(b.total, b.currency)})? ${b.name} gets their confirmation email.`,
      cancel: `Cancel ${b.code}? Its seats go back on sale${b.status === 'paid' ? ' — refund the customer separately' : ''}.`,
      resend: `Send ${b.name} their ${STATUS_LABEL[b.status].toLowerCase()} email again?`,
    }[kind]
    if (!confirm(ask)) return
    setBusy(b.id)
    try {
      if (kind === 'paid') await adminApi.markBookingPaid(b.id)
      else if (kind === 'cancel') await adminApi.cancelBooking(b.id)
      else await adminApi.resendBookingEmail(b.id)
      onChanged(
        kind === 'paid'
          ? `${b.code} is paid.`
          : kind === 'cancel'
            ? `${b.code} is cancelled — its seats are free.`
            : 'Email sent.',
      )
    } catch (err) {
      onError(err?.message || 'That didn’t work.')
    } finally {
      setBusy(0)
    }
  }

  async function download(b) {
    setBusy(b.id)
    try {
      await downloadBookingTickets(b)
    } catch (err) {
      onError(err?.message || 'The tickets didn’t download.')
    } finally {
      setBusy(0)
    }
  }

  return (
    <Card title={`Bookings${bookings.length ? ` (${bookings.length})` : ''}`}>
      {!bookings.length ? (
        <p className="text-sm text-as-charcoal/50">
          No bookings yet. When visitors book on the ticketing hub they appear here — reserved seats are held for 24
          hours until they pay online or in cash at AS Company.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl
              value={current}
              onChange={setView}
              options={BOOKING_VIEWS.map((v) => ({
                value: v.value,
                label: `${v.label} (${bookings.filter((b) => inView(b, v.value)).length})`,
              }))}
            />
            <div className="w-full sm:w-64">
              <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name, mobile or email" />
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="text-sm text-as-charcoal/50">Nothing here.</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {shown.map((b) => (
                <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-as-charcoal">{b.code}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[b.status]}`}
                      >
                        {STATUS_LABEL[b.status]}
                      </span>
                      <span className="text-sm font-semibold text-as-charcoal">{formatMoney(b.total, b.currency)}</span>
                    </p>
                    <p className="text-sm text-as-charcoal">
                      {b.name}
                      {b.mobile && (
                        <>
                          {' · '}
                          <a href={`https://wa.me/${b.mobile}`} target="_blank" rel="noreferrer" className="hover:text-as-red">
                            +{b.mobile}
                          </a>
                        </>
                      )}
                      {b.email && (
                        <>
                          {' · '}
                          <a href={`mailto:${b.email}`} className="hover:text-as-red">
                            {b.email}
                          </a>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-as-charcoal/60">
                      {[
                        b.seats.map((s) => `${s.row}${s.num}`).join(', '),
                        ...b.zones.map((z) => `${z.qty} × ${z.name}`),
                        bookingWhen(b),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {b.needsAttention && <p className="text-xs font-semibold text-as-red">⚠ {b.needsAttention}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {b.status === 'paid' && (
                      <Button onClick={() => download(b)} disabled={busy === b.id} className="px-3 py-1.5">
                        Download tickets
                      </Button>
                    )}
                    {(b.status === 'reserved' || b.status === 'expired') && (
                      <Button onClick={() => act(b, 'paid')} disabled={busy === b.id} className="px-3 py-1.5">
                        Paid in cash
                      </Button>
                    )}
                    {(b.status === 'reserved' || b.status === 'paid') && (
                      <Button
                        variant="danger"
                        onClick={() => act(b, 'cancel')}
                        disabled={busy === b.id}
                        className="px-3 py-1.5"
                      >
                        Cancel
                      </Button>
                    )}
                    {b.email && (
                      <Button variant="ghost" onClick={() => act(b, 'resend')} disabled={busy === b.id} className="px-3 py-1.5">
                        Resend email
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
