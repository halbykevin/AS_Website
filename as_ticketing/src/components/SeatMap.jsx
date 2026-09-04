'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDate } from '@/lib/events'
import { isNumberedSeat, money, seatmapSectionUrl, seatmapUrl, seatPlace, whatsappSeatsUrl } from '@/lib/seatmap'

// The seat picker: the partner's own hall, live, with what is still free — pick
// yours and send them to us on WhatsApp.
//
// Three sites feed it and they sell three different things, so the screen has
// to be able to be three shapes without becoming three components:
//
//   ticketingboxoffice.com  numbered seats for the whole hall, drawn as a grid
//                           rebuilt from their page
//   ihjoz.com               a drawing of the room: some blocks are numbered
//                           seats (tap one to open its grid), the rest are
//                           zones and tables sold whole
//   tickit.co               a drawing of the room, zones only — their seating
//                           is "free within your zone", so there is no seat to
//                           pick and pretending otherwise would be a lie
//
// The one thing this must never imply is that picking holds anything. It
// doesn't: only the partner's system can hold a seat, and between this fetch
// and your message someone else can buy the seat you tapped. That is why the
// button says "Request", the note under it says what happens next, and staff
// confirm every request by hand. Read server/src/seatmap.js for the rest.
//
// It renders nothing at all when there is no hall to draw, so the page falls
// back to its normal reserve button.

const MAX_SEATS = 10

// Geometry for the rebuilt grid. It is drawn at these sizes and then scaled to
// fit, so the scroll area's size can be computed from the data instead of
// measured after a paint — no layout thrash, and no flash at the wrong size.
const SEAT = 22
const SEAT_GAP = 4
const ROW = 26
const LABEL = 34

// How the partner's own drawing reacts to being picked from. It is injected
// markup, so the states are set as `data-state` on the shapes in an effect and
// styled here — Tailwind cannot reach inside a dangerouslySetInnerHTML.
//
// The `!important`s are not sloppiness. Both sites paint their blocks with an
// inline `style` — ihjoz ships every section at `opacity:0.5` with its own
// `stroke-width` — and an inline declaration outranks any stylesheet rule that
// isn't important. Without them a picked block gets no outline and a sold-out
// one never dims, silently.
//
// And picking deliberately does NOT raise the opacity, which is the obvious
// thing to reach for: ihjoz draws a block's name as a <text> BEFORE the block,
// so a fully opaque rectangle paints over its own label and the zone you just
// chose is the one square with no name on it. The outline says enough.
const MAP_CSS = `
.venue [data-sid] { cursor: pointer; transition: opacity .15s, filter .15s; }
.venue [data-state="off"] { opacity: .15 !important; pointer-events: none; }
.venue [data-state="free"]:hover, .venue [data-state="open"]:hover { filter: brightness(1.15); }
.venue [data-state="picked"], .venue [data-state="picked"] * { stroke: #383F41 !important; }
.venue [data-state="open"], .venue [data-state="open"] * { stroke: #A41E22 !important; }
/* Constant on screen rather than in the drawing's units: these viewBoxes are
   1440 wide, so a plain stroke-width that reads well on a desktop is a hairline
   on a phone and the outline stops being the thing that says "this one". */
.venue [data-state="picked"], .venue [data-state="picked"] *,
.venue [data-state="open"], .venue [data-state="open"] * {
  stroke-width: 3 !important;
  vector-effect: non-scaling-stroke;
}
.venue [data-sid] text, .venue [data-sid] tspan { pointer-events: none; }
.venue :focus-visible { outline: 2px solid #A41E22; outline-offset: 2px; }
`

export default function SeatMap({ event, whatsappNumber }) {
  const nights = useMemo(
    () => (event?.dates || []).filter((d) => d?.date).sort((a, b) => a.date.localeCompare(b.date)),
    [event],
  )
  // The whole row, not its date: two shows in one day are two halls.
  const [night, setNight] = useState(nights[0] || null)
  const date = night?.date || ''
  const [state, setState] = useState({ status: 'loading', data: null })
  const [selected, setSelected] = useState(new Map())
  const [qty, setQty] = useState(new Map())
  const [scale, setScale] = useState(1)
  const [fit, setFit] = useState(1)
  // Which block of a drawn map is open, and the seats inside it.
  const [openSid, setOpenSid] = useState('')
  const [block, setBlock] = useState({ status: 'idle', data: null })
  const boxRef = useRef(null)

  const load = useCallback(
    async (signal) => {
      setState((s) => ({ status: s.data ? 'refreshing' : 'loading', data: s.data }))
      try {
        const res = await fetch(seatmapUrl(event.slug, night), { cache: 'no-store', signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!data.available) return setState({ status: 'unavailable', data: null })
        setState({ status: 'ready', data })
      } catch (err) {
        if (err.name === 'AbortError') return
        setState({ status: 'error', data: null })
      }
    },
    [event.slug, night],
  )

  useEffect(() => {
    const ctrl = new AbortController()
    // A different night is a different hall — anything picked on the last one
    // would be a seat in another room.
    setSelected(new Map())
    setQty(new Map())
    setOpenSid('')
    setBlock({ status: 'idle', data: null })
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  // A block's seats are fetched when it is opened, not with the map: a hall can
  // have six of them and most visitors look at one.
  useEffect(() => {
    if (!openSid) return setBlock({ status: 'idle', data: null })
    const ctrl = new AbortController()
    setBlock({ status: 'loading', data: null })
    ;(async () => {
      try {
        const res = await fetch(seatmapSectionUrl(event.slug, openSid, night), {
          cache: 'no-store',
          signal: ctrl.signal,
        })
        const data = await res.json()
        setBlock(data?.available ? { status: 'ready', data } : { status: 'empty', data: null })
      } catch (err) {
        if (err.name !== 'AbortError') setBlock({ status: 'error', data: null })
      }
    })()
    return () => ctrl.abort()
  }, [event.slug, openSid, night])

  const data = state.data
  const map = data?.map || null
  // The box office sends the whole hall at once; ihjoz sends one block at a
  // time. Both arrive as the same rows.
  const rows = (openSid ? block.data?.rows : data?.rows) || []
  const currency = block.data?.currency || data?.currency || 'USD'
  const tiers = (openSid ? block.data?.tiers : data?.tiers) || []
  const totals = (openSid ? block.data?.totals : data?.totals) || { seats: 0, available: 0 }

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

  // Seat ids are only unique inside the block they came from, so the block is
  // part of the key — otherwise opening a second zone would silently replace
  // the seats already chosen in the first.
  const keyOf = (seat) => `${openSid || 'hall'}:${seat.id}`

  const toggle = (row, seat, key = keyOf(seat)) => {
    if (seat.state !== 'free') return
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else if (next.size < MAX_SEATS) {
        next.set(key, {
          id: key,
          num: seat.num,
          price: seat.price,
          row: row.label,
          section: row.section,
        })
      }
      return next
    })
  }

  const setZone = (zone, value) => {
    const v = Math.max(0, Math.min(value, zone.max || MAX_SEATS))
    setQty((prev) => {
      const next = new Map(prev)
      if (v > 0) next.set(zone.id, v)
      else next.delete(zone.id)
      return next
    })
  }

  // Tapping the drawing: a numbered block opens its seats, a zone or table is
  // picked there and then.
  const pickSection = (section) => {
    if (section.kind === 'seats') {
      setOpenSid((cur) => (cur === section.id ? '' : section.id))
      return
    }
    const zone = (data?.zones || []).find((z) => z.id === section.id)
    if (!zone) return
    setZone(zone, qty.get(zone.id) ? 0 : zone.min || 1)
  }

  const reserve = whatsappSeatsUrl(whatsappNumber, {
    event,
    date,
    seats: seatsChosen,
    zones: zonesChosen,
    currency,
  })

  // Nothing at all until we know there is a hall — not even a skeleton.
  //
  // hasSeatmap() only rules out the events sold somewhere we can't read; on the
  // three sites we can, most events still have no map (a club night sells one
  // kind of ticket). Showing "Choose your seats" for a second and then removing
  // it promises a seat picker to almost everyone who will never get one, so the
  // panel arrives late instead — it sits below the event details, where a
  // section appearing a beat after the page is ordinary.
  if (!data) return null

  const pickedZoneIds = new Set(zonesChosen.map((z) => z.id))
  const zones = data?.zones || []

  return (
    <section className="mt-10 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-4">
        <div>
          {/* Say what is actually on offer. "Choose your area" over a club
              night's single General Admission line is a promise of a choice
              that isn't there. */}
          <h2 className="text-base font-extrabold text-as-charcoal">
            {rows.length ? 'Choose your seats' : map ? 'Choose your area' : 'Tickets'}
          </h2>
          <p className="mt-0.5 text-xs text-as-charcoal/55">
            Live availability from the ticket office — pick what you want and send it to us on WhatsApp.
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

      {/* One hall per night: every one of the three sells each night separately,
          with its own seats already gone. */}
      {nights.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-black/5 px-5 py-3">
          {nights.map((n) => (
            <button
              key={`${n.date}|${n.time || ''}`}
              type="button"
              onClick={() => setNight(n)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                n === night
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

      {/* The partner's own drawing of the room, for the two sites that publish
          one. It is the only sane way to choose between 82 tables: a list of
          names says nothing about where any of them is. */}
      {map && (
        <VenueMap
          map={map}
          currency={currency}
          openSid={openSid}
          pickedIds={pickedZoneIds}
          onPick={pickSection}
        />
      )}

      {(rows.length > 0 || (openSid && block.status === 'loading')) && (
        <div className="border-t border-black/5 px-5 py-4">
          {openSid && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-as-charcoal/45">
                {block.data?.section?.name || 'Seats'}
              </h3>
              <button
                type="button"
                onClick={() => setOpenSid('')}
                className="text-xs font-semibold text-as-charcoal/50 transition hover:text-as-red"
              >
                Back to the map
              </button>
            </div>
          )}

          {block.status === 'loading' && openSid ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-black/[0.06]" style={{ width: `${60 + i * 6}%` }} />
              ))}
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <Legend tiers={tiers} currency={currency} />
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
                            picked={selected.has(keyOf(seat))}
                            disabled={full && !selected.has(keyOf(seat))}
                            onClick={() => toggle(row, seat)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="mt-1 text-[11px] text-as-charcoal/45">
                {totals.available} of {totals.seats} seats free
                {rows[0]?.section ? ` in ${[...new Set(rows.map((r) => r.section))].filter(Boolean).join(', ')}` : ''}
                {' · '}scroll sideways to see the whole hall
              </p>
            </>
          )}
        </div>
      )}

      {openSid && block.status === 'empty' && (
        <p className="border-t border-black/5 px-5 py-4 text-sm text-as-charcoal/55">
          We couldn’t read the seats in this block. Pick another, or ask us on WhatsApp and we’ll check by hand.
        </p>
      )}

      {/* Zones: the whole choice on a site that sells areas rather than
          seats, the tables around a seated hall, and the blocks the box
          office didn't load. Either way they are priced and can be asked
          for by the number of tickets. */}
      {zones.length > 0 && !openSid && (
        <ZoneList
          zones={zones}
          qty={qty}
          currency={currency}
          hasRows={rows.length > 0}
          hasMap={Boolean(map)}
          onChange={setZone}
        />
      )}

      <footer className="border-t border-black/5 bg-black/[0.02] px-5 py-4">
        {count > 0 ? (
          <>
            <ul className="mb-3 flex flex-wrap gap-1.5">
              {seatsChosen.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => toggle({ label: s.row, section: s.section }, { id: s.id, state: 'free' }, s.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-as-red/10 px-2.5 py-1 text-xs font-semibold text-as-red transition hover:bg-as-red/15"
                  >
                    {[seatPlace(s), isNumberedSeat(s.num) ? `#${s.num}` : null].filter(Boolean).join(' · ')}
                    <span aria-hidden>×</span>
                  </button>
                </li>
              ))}
              {zonesChosen.map((z) => (
                <li key={z.id}>
                  <button
                    type="button"
                    onClick={() => setZone(z, 0)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-as-red/10 px-2.5 py-1 text-xs font-semibold text-as-red transition hover:bg-as-red/15"
                  >
                    {z.qty} × {z.name}
                    <span aria-hidden>×</span>
                  </button>
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
            {rows.length
              ? `Tap the seats you want${zones.length ? ', or pick an area' : ''}.`
              : map
                ? 'Tap an area on the map, or pick one from the list.'
                : 'Choose how many tickets you want.'}
          </p>
        )}
        {/* The honest bit, and it stays. */}
        <p className="mt-3 text-[11px] leading-relaxed text-as-charcoal/45">
          Seats aren’t held until we confirm. We check with the ticket office and reply on WhatsApp —
          if one has just gone, we’ll offer you the closest we can get.
          {full && ' You can request up to ' + MAX_SEATS + ' seats at a time.'}
    </p>
  </footer>
    </section>
  )
}

/**
 * The partner's drawing of the room.
 *
 * The markup is theirs, stripped to shapes by server/src/seatmap/svg.js, so
 * everything interactive is added here: each block carries `data-sid`, this
 * writes a `data-state` onto it and MAP_CSS paints that. The one <svg> root is
 * ours, which is what stops the file from setting its own size or style.
 */
function VenueMap({ map, currency, openSid, pickedIds, onPick }) {
  const hostRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const byId = useMemo(() => new Map((map.sections || []).map((s) => [s.id, s])), [map])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    for (const node of el.querySelectorAll('[data-sid]')) {
      const section = byId.get(node.getAttribute('data-sid'))
      const state = !section?.inStock
        ? 'off'
        : pickedIds.has(section.id)
          ? 'picked'
          : openSid === section.id
            ? 'open'
            : 'free'
      node.setAttribute('data-state', state)
      if (!section) continue
      node.setAttribute('role', 'button')
      node.setAttribute('tabindex', state === 'off' ? '-1' : '0')
      node.setAttribute(
        'aria-label',
        `${section.name} — ${section.inStock ? money(section.price, currency) : 'not on sale'}`,
      )
      node.setAttribute('aria-pressed', String(state === 'picked'))
    }
  }, [byId, pickedIds, openSid, currency, map.svg])

  const activate = (target) => {
    const node = target?.closest?.('[data-sid]')
    if (!node) return
    const section = byId.get(node.getAttribute('data-sid'))
    if (section?.inStock) onPick(section)
  }

  const onSale = (map.sections || []).filter((s) => s.inStock).length

  return (
    <div className="px-5 py-4">
      <style>{MAP_CSS}</style>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-as-charcoal/45">
          {onSale} of {(map.sections || []).length} areas on sale · tap one to choose it
        </p>
        <Zoom scale={zoom} fit={1} onChange={setZoom} />
      </div>
      <div className="overflow-auto rounded-xl bg-black/[0.015] ring-1 ring-black/5">
        <div className="venue" style={{ width: `${zoom * 100}%` }}>
          <svg
            viewBox={map.viewBox || '0 0 1000 1000'}
            className="block h-auto w-full"
            role="group"
            aria-label="Venue map"
            onClick={(e) => activate(e.target)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                activate(e.target)
              }
            }}
            ref={hostRef}
            dangerouslySetInnerHTML={{ __html: map.svg }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Every area, priced, with the number of tickets.
 *
 * It stays even when the drawing is there: the drawing is how you find the
 * block you want, and a 29-pixel table on a phone is not something to have to
 * hit. A block sold whole — a table of four, min 4 / max 4 — is one choice
 * rather than a counter, because there is no such thing as three of it.
 */
function ZoneList({ zones, qty, currency, hasRows, hasMap, onChange }) {
  const sorted = useMemo(
    () => [...zones].sort((a, b) => Number(b.inStock) - Number(a.inStock)),
    [zones],
  )
  const long = sorted.length > 8
  return (
    <div className="border-t border-black/5 px-5 py-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-as-charcoal/45">
        {hasRows ? 'Other areas' : hasMap ? 'Choose your area' : 'Tickets'}
      </h3>
      <ul className={`mt-3 space-y-2 ${long ? 'max-h-80 overflow-y-auto pr-1' : ''}`}>
        {sorted.map((z) => {
          const picked = qty.get(z.id) || 0
          const whole = z.min > 1 && z.min === z.max
          return (
            <li
              key={z.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/[0.02] px-4 py-2.5 ring-1 ring-black/5"
            >
              <span className="min-w-0">
                <span className="text-sm font-semibold text-as-charcoal">{z.name}</span>
                {z.inStock ? (
                  <span className="ml-2 text-sm text-as-charcoal/60">{money(z.price, currency)}</span>
                ) : (
                  <span className="ml-2 text-xs text-as-charcoal/40">not on sale</span>
                )}
                {whole && z.inStock && (
                  <span className="ml-2 text-xs text-as-charcoal/40">table of {z.min}</span>
                )}
                {z.left > 0 && z.left <= 10 && z.inStock && (
                  <span className="ml-2 text-xs text-as-red/70">{z.left} left</span>
                )}
              </span>
              {whole ? (
                <button
                  type="button"
                  disabled={!z.inStock}
                  onClick={() => onChange(z, picked ? 0 : z.min)}
                  aria-pressed={picked > 0}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-30 ${
                    picked
                      ? 'bg-as-red text-white'
                      : 'text-as-charcoal/70 ring-1 ring-black/10 hover:text-as-red'
                  }`}
                >
                  {picked ? 'Chosen' : 'Choose'}
                </button>
              ) : (
                <Stepper
                  value={picked}
                  disabled={!z.inStock}
                  max={Math.min(z.max || MAX_SEATS, MAX_SEATS)}
                  onChange={(v) => onChange(z, v)}
                />
              )}
            </li>
          )
        })}
      </ul>
    </div>
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
          {t.seats > 0 && <span className="text-as-charcoal/35">({t.available})</span>}
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
  const step = (dir) => onChange(Math.min(2.4, Math.max(fit, Number((scale + dir * 0.2).toFixed(2)))))
  return (
    <div className="flex items-center gap-1">
      <ZoomButton label="Zoom out" onClick={() => step(-1)} disabled={scale <= fit}>
        −
      </ZoomButton>
      <ZoomButton label="Zoom in" onClick={() => step(1)} disabled={scale >= 2.4}>
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

function Stepper({ value, onChange, disabled, max = MAX_SEATS }) {
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
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-as-charcoal/60 ring-1 ring-black/10 transition hover:text-as-red disabled:opacity-30"
      >
        +
      </button>
    </span>
  )
}
