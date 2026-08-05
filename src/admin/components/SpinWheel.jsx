import { useCallback, useEffect, useRef, useState } from 'react'
import { TAU, normalize, easeOut, randomIndex, indexAtPointer, spinDelta } from './wheelMath.js'

// The lucky-draw wheel: a canvas prize wheel that spins to a cryptographically
// random entry and settles under the pointer at 12 o'clock.
//
// Everything is drawn on one <canvas> so a pool of hundreds of names still spins
// at 60fps (a DOM node per segment would not). The winner is chosen up front and
// the final rotation is derived from it — the animation is the reveal, never the
// decision, so the result can't drift with the frame rate.

// Segment palette — brand red/charcoal tones plus a gold accent. All dark
// enough for white labels; consecutive entries always differ.
const COLORS = ['#A41E22', '#383F41', '#C53A3F', '#5A6366', '#82161A', '#9A7B16']

// Short synthesised click as each segment passes the pointer — no audio assets,
// and it only ever starts from the click that begins a spin.
function createTicker() {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!Ctx) return null
  let ctx = null
  return {
    tick(strength = 1) {
      try {
        if (!ctx) ctx = new Ctx()
        if (ctx.state === 'suspended') ctx.resume()
        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(1100 + strength * 500, now)
        gain.gain.setValueAtTime(0.05 * strength, now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.05)
      } catch {
        /* audio is a nicety — never let it break the spin */
      }
    },
  }
}

// Truncate a label to the space available along the radius.
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1)
  return `${out}…`
}

function drawWheel(ctx, size, entries, rotation) {
  const cx = size / 2
  const cy = size / 2
  const rim = 9
  const r = size / 2 - rim
  const hub = Math.max(38, size * 0.13)
  const n = entries.length

  ctx.clearRect(0, 0, size, size)

  // Empty pool — a dashed placeholder ring so the tool never looks broken.
  if (n === 0) {
    ctx.save()
    ctx.setLineDash([10, 10])
    ctx.strokeStyle = 'rgba(56,63,65,0.22)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, TAU)
    ctx.stroke()
    ctx.restore()
    return
  }

  const seg = TAU / n
  // The arc height at the label's radius decides whether text can fit at all.
  const labelR = r * 0.94
  const fontSize = Math.min(19, Math.max(7, 2 * Math.sin(seg / 2) * (r * 0.7) * 0.62))
  const showLabels = fontSize >= 8.5

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotation)

  for (let i = 0; i < n; i++) {
    const a0 = i * seg
    const a1 = a0 + seg
    // Nudge the last colour when the palette wraps, so segment 0 and n-1 differ.
    let color = COLORS[i % COLORS.length]
    if (i === n - 1 && color === COLORS[0]) color = COLORS[1]

    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, r, a0, a1)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    if (n <= 80) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    if (showLabels) {
      const e = entries[i]
      const label = [e.drawNumber, e.fullName].filter(Boolean).join(' · ')
      ctx.save()
      ctx.rotate(a0 + seg / 2)
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`
      ctx.fillStyle = '#fff'
      ctx.shadowColor = 'rgba(0,0,0,0.35)'
      ctx.shadowBlur = 2
      ctx.fillText(fitText(ctx, label, labelR - hub - 16), labelR - 10, 0)
      ctx.restore()
    }
  }
  ctx.restore()

  // Outer rim + hub ring, drawn unrotated so they stay perfectly still.
  ctx.beginPath()
  ctx.arc(cx, cy, r + rim / 2, 0, TAU)
  ctx.strokeStyle = '#383F41'
  ctx.lineWidth = rim
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, r + rim / 2, 0, TAU)
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, hub + 6, 0, TAU)
  ctx.fillStyle = '#fff'
  ctx.fill()
}

export default function SpinWheel({ entries, onWinner, onSpinningChange, spinToken = 0, disabled = false }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const rotationRef = useRef(0)
  const frameRef = useRef(0)
  const tickerRef = useRef(null)
  const lastIndexRef = useRef(-1)
  const entriesRef = useRef(entries)
  const spinRef = useRef(null)
  const paintRef = useRef(null)
  const lastTickRef = useRef(0)
  const [size, setSize] = useState(420)
  const [spinning, setSpinning] = useState(false)
  const [current, setCurrent] = useState(null)
  const [sound, setSound] = useState(() => localStorage.getItem('as_wheel_sound') !== 'off')

  entriesRef.current = entries
  const count = entries.length

  useEffect(() => {
    localStorage.setItem('as_wheel_sound', sound ? 'on' : 'off')
  }, [sound])

  // Track the container width so the wheel is crisp at every breakpoint.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      if (w > 0) setSize(Math.round(Math.min(w, 520)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // `list` pins the pool for the duration of a spin, so a wheel that is mid-spin
  // keeps drawing the exact segments the winner was drawn from even if the pool
  // changes underneath it.
  const paint = useCallback(
    (list) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2)
      if (canvas.width !== Math.round(size * dpr)) {
        canvas.width = Math.round(size * dpr)
        canvas.height = Math.round(size * dpr)
      }
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawWheel(ctx, size, list || entriesRef.current, rotationRef.current)
    },
    [size]
  )
  // The animation loop reads paint through a ref, so a resize mid-spin repaints
  // at the new size instead of the one captured when the spin started.
  paintRef.current = paint

  // Repaint the idle wheel whenever the pool or the size changes. Skipped while
  // spinning — the animation loop owns the canvas until it settles.
  useEffect(() => {
    if (spinning) return
    paint()
    setCurrent(count ? entries[indexAtPointer(rotationRef.current, count)] : null)
  }, [paint, entries, count, spinning])

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  function spin() {
    const pool = entriesRef.current
    if (spinning || disabled || pool.length === 0) return

    const winnerIndex = randomIndex(pool.length)
    const from = rotationRef.current
    const delta = spinDelta(from, winnerIndex, pool.length)
    const duration = 5600 + Math.random() * 1600
    const start = performance.now()

    if (sound && !tickerRef.current) tickerRef.current = createTicker()
    lastIndexRef.current = indexAtPointer(from, pool.length)
    lastTickRef.current = 0

    setSpinning(true)
    onSpinningChange?.(true)

    const step = (now) => {
      const t = Math.min(1, (now - start) / duration)
      rotationRef.current = from + delta * easeOut(t)
      paintRef.current?.(pool)

      const idx = indexAtPointer(rotationRef.current, pool.length)
      if (idx !== lastIndexRef.current) {
        lastIndexRef.current = idx
        // A 300-name wheel flies past dozens of segments a second early on —
        // rate-limit the readout and the click so neither turns into noise.
        if (now - lastTickRef.current > 55 || t === 1) {
          lastTickRef.current = now
          setCurrent(pool[idx])
          // Ticks get softer as the wheel slows — the classic prize-wheel sound.
          if (sound) tickerRef.current?.tick(0.35 + 0.65 * (1 - t))
        }
      }

      if (t < 1) {
        frameRef.current = requestAnimationFrame(step)
        return
      }
      rotationRef.current = normalize(rotationRef.current)
      setCurrent(pool[winnerIndex])
      setSpinning(false)
      onSpinningChange?.(false)
      // Beat of silence on the settled wheel before the reveal lands.
      setTimeout(() => onWinner?.(pool[winnerIndex]), 450)
    }
    frameRef.current = requestAnimationFrame(step)
  }

  // The winner card's "spin again" bumps spinToken instead of holding a ref to
  // this component. The ref hop keeps the effect off `spin`'s identity.
  spinRef.current = spin
  useEffect(() => {
    if (spinToken > 0) spinRef.current?.()
  }, [spinToken])

  const canSpin = count > 0 && !disabled && !spinning

  return (
    <div className="flex flex-col items-center">
      <div ref={wrapRef} className="relative w-full max-w-[520px]">
        <div className="relative mx-auto" style={{ width: size, height: size }}>
          {/* Pointer — fixed at 12 o'clock, dipping into the rim. */}
          <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1">
            <svg width="34" height="42" viewBox="0 0 34 42" aria-hidden="true">
              <path
                d="M17 41 L3 12 A15 15 0 1 1 31 12 Z"
                fill="#A41E22"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <circle cx="17" cy="14" r="4.5" fill="#fff" />
            </svg>
          </div>

          <canvas
            ref={canvasRef}
            style={{ width: size, height: size }}
            className="block rounded-full shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)]"
            aria-hidden="true"
          />

          {/* Hub = the play button. */}
          <button
            type="button"
            onClick={spin}
            disabled={!canSpin}
            aria-label={spinning ? 'Spinning' : 'Spin the wheel'}
            className={`absolute left-1/2 top-1/2 z-10 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-lg ring-4 ring-white transition ${
              canSpin
                ? 'bg-as-red hover:scale-105 hover:bg-as-red-light active:scale-95'
                : 'cursor-not-allowed bg-as-charcoal/40'
            }`}
            style={{ width: Math.max(76, size * 0.26), height: Math.max(76, size * 0.26) }}
          >
            {spinning ? (
              <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-white/40 border-t-white" />
            ) : (
              <span className="text-center text-sm font-extrabold uppercase leading-tight tracking-wide">
                Play
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Live readout — the name passing under the pointer right now. */}
      <div className="mt-5 w-full max-w-[520px]">
        <div
          className={`rounded-2xl border px-4 py-3 text-center transition ${
            spinning ? 'border-as-red/30 bg-as-red/5' : 'border-black/10 bg-white'
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-as-charcoal/45">
            {spinning ? 'Spinning…' : count > 0 ? 'Ready to draw' : 'No entries yet'}
          </p>
          <p className="mt-0.5 truncate text-lg font-extrabold text-as-charcoal">
            {current ? (
              <>
                {current.drawNumber && (
                  <span className="mr-2 rounded-md bg-as-red/10 px-1.5 py-0.5 text-sm tabular-nums text-as-red">
                    {current.drawNumber}
                  </span>
                )}
                {current.fullName}
              </>
            ) : (
              <span className="text-as-charcoal/35">—</span>
            )}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={spin}
            disabled={!canSpin}
            className="rounded-full bg-as-charcoal px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-as-charcoal/85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {spinning ? 'Spinning…' : 'Spin the wheel'}
          </button>
          <button
            type="button"
            onClick={() => setSound((s) => !s)}
            aria-pressed={sound}
            title={sound ? 'Sound on' : 'Sound off'}
            className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-white text-as-charcoal/70 transition hover:text-as-red"
          >
            {sound ? '🔊' : '🔇'}
          </button>
        </div>
      </div>
    </div>
  )
}
