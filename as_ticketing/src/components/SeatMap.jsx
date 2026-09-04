'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDate } from '@/lib/events'
import { isNumberedSeat, money, seatmapUrl, seatPlace, whatsappSeatsUrl } from '@/lib/seatmap'

// The seat picker: the box office's own hall, live, with the seats that are
// still free — pick yours and send them to us on WhatsApp.
//
// The one thing this must never imply is that picking holds anything. It
// doesn't: only the box office's system can hold a seat, and between this fetch
// and your message someone else can buy the seat you tapped. That is why the
// button says "Request", the note under it says what happens next, and staff
// confirm every request by hand. Read server/src/seatmap.js for the rest.
//
// It renders nothing at all when there is no hall to draw (every other partner,
// and hand-made events), so the page falls back to its normal reserve button.

const MAX_SEATS = 10

// Geometry. The map is drawn at these sizes and then scaled to fit, so the
// scroll area's size can be computed from the data instead of measured after a
// paint — no layout thrash, and no flash of a map at the wrong size.
const SEAT = 22
const SEAT_GAP = 4
const ROW = 26
const LABEL = 34

export default function SeatMap({ event, whatsappNumber }) {
  const nights = useMemo(
    () => (event?.dates || []).filter((d) => d?.date).sort((a, b) => a.date.localeCompare(b.date)),
    [event],
  )
  const [date, setDate] = useState(nights[0]?.date || '')
  const [state, setState] = useState({ status: 'loading', data: null })
  const [selected, setSelected] = useState(new Map())
  const [qty, setQty] = useState(new Map())
  const [scale, setScale] = useState(1)
  const [fit, setFit] = useState(1)
  const boxRef = useRef(null)

  const load = useCallback(
    async (signal) => {
      setState((s) => ({ status: s.data ? 'refreshing' : 'loading', data: s.data }))
      try {
        const res = await fetch(seatmapUrl(event.slug, date), { cache: 'no-store', signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!data.available) return setState({ status: 'unavailable', data: null })
        setState({ status: 'ready', data })
      } catch (err) {
        if (err.name === 'AbortError') return
        setState({ status: 'error', data: null })
      }
    },
    [event.slug, date],
  )

  useEffect(() => {
    const ctrl = new AbortController()
    // A different night is a different hall — anything picked on the last one
    // would be a seat in another room.
    setSelected(new Map())
    setQty(new Map())
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  const data = state.data
  const rows = data?.rows || []
  const currency = data?.currency || 'USD'

  // Widest row decides the drawing width; everything else follows from it.
  const mapWidth = useMemo(() => {
    const widest = rows.reduce((m, r) => Math.max(m, r.seats.length), 0)
    return LABEL * 2 + widest * (SEAT + SEAT_GAP)
  }, [rows])
  const mapHeight = rows.length * ROW + 8

  // Fit the whole hall on screen first — you can't choose a seat in a room you
  // can't see — then let people zoom in to tap precisely.
  useEffect(() => {
    const el = boxRef.current
    if (!el || !mapWidth) return
    const measure = () => {
      const next = Math.min(1, Math.max(0.25, el.clientWidth / mapWidth))
      setFit(next)
      setScale(next)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mapWidth])

  const seatsChosen = [...selected.values()]
  const zonesChosen = useMemo(
    () =>
      (data?.zones || [])
        .map((z) => ({ ...z, qty: qty.get(z.id) || 0 }))
        .filter((z) => z.qty > 0),
    [data, qty],
  )
  const total =
    seatsChosen.reduce((sum, s) => sum + s.price, 0) +
    zonesChosen.reduce((sum, z) => sum + z.price * z.qty, 0)
  const count = seatsChosen.length + zonesChosen.reduce((n, z) => n + z.qty, 0)
  const full = seatsChosen.length >= MAX_SEATS

  const toggle = (row, seat) => {
    if (seat.state !== 'free') return
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(seat.id)) next.delete(seat.id)
      else if (next.size < MAX_SEATS) {
        next.set(seat.id, {
          id: seat.id,
          num: seat.num,
          price: seat.price,
          row: row.label,
          section: row.section,
        })
      }
      return next
    })
  }

  const reserve = whatsappSeatsUrl(whatsappNumber, {
    event,
    date,
    seats: seatsChosen,
    zones: zonesChosen,
    currency,
  })

  if (state.status === 'unavailable' || state.status === 'error') return null

  return (
    <section className="mt-10 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-4">
        <div>
          <h2 className="text-base font-extrabold text-as-charcoal">Choose your seats</h2>
          <p className="mt-0.5 text-xs text-as-charcoal/55">
            Live availability from the box office — pick your seats and send them to us on WhatsApp.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-as-charcoal/60 ring-1 ring-black/10 transition hover:text-as-red"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${state.status === 'refreshing' ? 'bg-as-gray' : 'bg-emerald-500'}`} />
          {state.status === 'refreshing' ? 'Checking…' : 'Refresh'}
        </button>
      </header>

      {/* One hall per night: each date is its own page at the box office, with
          its own seats sold. */}
      {nights.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-black/5 px-5 py-3">
          {nights.map((n) => (
            <button
              key={n.date}
              type="button"
              onClick={() => setDate(n.date)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                n.date === date
                  ? 'bg-as-red text-white'
                  : 'bg-black/[0.04] text-as-charcoal/70 hover:bg-black/[0.07]'
              }`}
            >
              {formatDate(n.date)}
              {n.time ? ` · ${n.time}` : ''}
            </button>
          ))}
        </div>
      )}

      {state.status === 'loading' ? (
        <div className="space-y-2 px-5 py-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-black/[0.06]" style={{ width: `${55 + i * 7}%` }} />
          ))}
        </div>
      ) : (
        <>
          {rows.length > 0 && (
            <div className="px-5 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <Legend tiers={data.tiers} currency={currency} />
                <Zoom scale={scale} fit={fit} onChange={setScale} />
              </div>

              <div ref={boxRef} className="overflow-x-auto pb-2">
                <div style={{ width: mapWidth * scale, height: mapHeight * scale }}>
                  <div style={{ width: mapWidth, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                    <div className="mb-2 rounded-md bg-as-ink py-1 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                      Stage
                    </div>
                    {rows.map((row) => (
                      <div key={row.id} className="flex items-center" style={{ height: ROW }}>
                        <span
                          className="shrink-0 text-right text-[10px] font-semibold text-as-charcoal/40"
                          style={{ width: LABEL - 6, paddingRight: 6 }}
                        >
                          {row.label}
                        </span>
                        {row.seats.map((seat) => (
                          <Seat
                            key={seat.id}
                            seat={seat}
                            row={row}
                            picked={selected.has(seat.id)}
                            disabled={full && !selected.has(seat.id)}
                            onClick={() => toggle(row, seat)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="mt-1 text-[11px] text-as-charcoal/45">
                {data.totals.available} of {data.totals.seats} seats free
                {rows[0]?.section ? ` in ${[...new Set(rows.map((r) => r.section))].filter(Boolean).join(', ')}` : ''}
                {' · '}scroll sideways to see the whole hall
              </p>
            </div>
          )}

          {/* Zones: the whole choice for a hall with no numbered seats, and the
              blocks the box office didn't load for one that has. Either way
              they are priced and can be asked for by the number of tickets. */}
          {data?.zones?.length > 0 && (
            <div className="border-t border-black/5 px-5 py-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-as-charcoal/45">
                {rows.length ? 'Other areas' : 'Choose your area'}
              </h3>
              <ul className="mt-3 space-y-2">
                {data.zones.map((z) => (
                  <li
                    key={z.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/[0.02] px-4 py-2.5 ring-1 ring-black/5"
                  >
                    <span className="min-w-0">
                      <span className="text-sm font-semibold text-as-charcoal">{z.name}</span>
                      <span className="ml-2 text-sm text-as-charcoal/60">{money(z.price, currency)}</span>
                      {!z.inStock && <span className="ml-2 text-xs text-as-charcoal/40">sold out</span>}
                    </span>
                    <Stepper
                      value={qty.get(z.id) || 0}
                      disabled={!z.inStock}
                      onChange={(v) =>
                        setQty((prev) => {
                          const next = new Map(prev)
                          if (v > 0) next.set(z.id, v)
                          else next.delete(z.id)
                          return next
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <footer className="border-t border-black/5 bg-black/[0.02] px-5 py-4">
            {count > 0 ? (
              <>
                <ul className="mb-3 flex flex-wrap gap-1.5">
                  {seatsChosen.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => toggle({ label: s.row, section: s.section }, { id: s.id, state: 'free' })}
                        className="inline-flex items-center gap-1.5 rounded-full bg-as-red/10 px-2.5 py-1 text-xs font-semibold text-as-red transition hover:bg-as-red/15"
                      >
                        {[seatPlace(s), isNumberedSeat(s.num) ? `#${s.num}` : null].filter(Boolean).join(' · ')}
                        <span aria-hidden>×</span>
                      </button>
                    </li>
                  ))}
                  {zonesChosen.map((z) => (
                    <li
                      key={z.id}
                      className="inline-flex items-center rounded-full bg-as-red/10 px-2.5 py-1 text-xs font-semibold text-as-red"
                    >
                      {z.qty} × {z.name}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-as-charcoal/70">
                    <span className="font-bold text-as-charcoal">
                      {count} {count === 1 ? 'ticket' : 'tickets'}
                    </span>
                    {' · '}
                    {money(total, currency)}
                  </p>
                  {reserve ? (
                    <a
                      href={reserve}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-as-red px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light"
                    >
                      Request on WhatsApp
                    </a>
                  ) : (
                    <span className="text-xs text-as-charcoal/50">Contact us to reserve these.</span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-as-charcoal/55">
                Tap the seats you want{data?.zones?.length ? ', or pick an area above' : ''}.
              </p>
            )}
            {/* The honest bit, and it stays. */}
            <p className="mt-3 text-[11px] leading-relaxed text-as-charcoal/45">
              Seats aren’t held until we confirm. We check with the box office and reply on WhatsApp —
              if one has just gone, we’ll offer you the closest we can get.
              {full && ' You can request up to ' + MAX_SEATS + ' seats at a time.'}
            </p>
          </footer>
        </>
      )}
    </section>
  )
}

function Seat({ seat, row, picked, disabled, onClick }) {
  if (seat.state === 'gap') {
    return <span aria-hidden style={{ width: SEAT + SEAT_GAP, height: SEAT }} className="shrink-0" />
  }
  const sold = seat.state === 'sold'
  const label = `${seatPlace({ section: row.section, row: row.label })}${
    isNumberedSeat(seat.num) ? `, seat ${seat.num}` : ''
  } — ${sold ? 'sold' : money(seat.price)}`
  return (
    <span className="shrink-0" style={{ width: SEAT + SEAT_GAP, height: SEAT }}>
      <button
        type="button"
        onClick={onClick}
        disabled={sold || disabled}
        title={label}
        aria-label={label}
        aria-pressed={picked}
        className={`block rounded-[4px] transition ${
          sold
            ? 'cursor-not-allowed bg-black/[0.08]'
            : picked
              ? 'ring-2 ring-as-charcoal ring-offset-1'
              : disabled
                ? 'cursor-not-allowed opacity-40'
                : 'hover:ring-2 hover:ring-as-charcoal/40'
        }`}
        style={{
          width: SEAT,
          height: SEAT,
          background: sold ? undefined : seat.color || '#A41E22',
        }}
      />
    </span>
  )
}

function Legend({ tiers = [], currency }) {
  if (!tiers.length) return null
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-as-charcoal/60">
      {tiers.map((t) => (
        <li key={t.price} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px]" style={{ background: t.color || '#A41E22' }} />
          {money(t.price, currency)}
          <span className="text-as-charcoal/35">({t.available})</span>
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px] bg-black/[0.08]" />
        sold
      </li>
    </ul>
  )
}

function Zoom({ scale, fit, onChange }) {
  const step = (dir) => onChange(Math.min(1.6, Math.max(fit, Number((scale + dir * 0.2).toFixed(2)))))
  return (
    <div className="flex items-center gap-1">
      <ZoomButton label="Zoom out" onClick={() => step(-1)} disabled={scale <= fit}>
        −
      </ZoomButton>
      <ZoomButton label="Zoom in" onClick={() => step(1)} disabled={scale >= 1.6}>
        +
      </ZoomButton>
    </div>
  )
}

function ZoomButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-as-charcoal/60 ring-1 ring-black/10 transition hover:text-as-red disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function Stepper({ value, onChange, disabled }) {
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-label="One fewer"
        disabled={disabled || value === 0}
        onClick={() => onChange(value - 1)}
        className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-as-charcoal/60 ring-1 ring-black/10 transition hover:text-as-red disabled:opacity-30"
      >
        −
      </button>
      <span className="w-4 text-center text-sm font-semibold text-as-charcoal">{value}</span>
      <button
        type="button"
        aria-label="One more"
        disabled={disabled || value >= MAX_SEATS}
        onClick={() => onChange(value + 1)}
        className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-as-charcoal/60 ring-1 ring-black/10 transition hover:text-as-red disabled:opacity-30"
      >
        +
      </button>
    </span>
  )
}
