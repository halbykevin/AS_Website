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

// Radius of the white centre disc — and of the Play button that sits on it, so
// the two always agree. Kept lean: every pixel here is radial space the labels
// lose, and a cut-off name is worse than a small button.
const hubRadius = (size) => Math.max(28, size * 0.085)

// Truncate a label to the space available along the radius.
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1)
  return `${out}…`
}

const font = (weight, px) => `${weight} ${px}px Inter, system-ui, sans-serif`

// Set the largest font at or below `base` that fits `text`, down to `min`.
// Long names shrink a little instead of being cut off — on a wheel of real
// names one size can never fit both "Lena Khattar" and "Charbel Estephan", and
// a whole name at 16px beats half a name at 21px. Returns the size used;
// callers still run fitText as a backstop for the truly enormous.
function fitFont(ctx, text, maxWidth, base, min, weight) {
  ctx.font = font(weight, base)
  const w = ctx.measureText(text).width
  if (w <= maxWidth || w === 0) return base
  // Advance width is near-linear in font size, so one estimate lands close;
  // measure again and step down if hinting pushed it over.
  let px = Math.max(min, base * (maxWidth / w))
  ctx.font = font(weight, px)
  while (px > min && ctx.measureText(text).width > maxWidth) {
    px = Math.max(min, px - 0.5)
    ctx.font = font(weight, px)
  }
  return px
}

// Exported so the label-fitting rules can be exercised against a stub canvas.
export function drawWheel(ctx, size, entries, rotation) {
  const cx = size / 2
  const cy = size / 2
  const rim = 9
  const r = size / 2 - rim
  const hub = hubRadius(size)
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
  // Labels radiate inward from just inside the rim. The arc height each segment
  // gets decides both the type size and whether the draw number can sit on its
  // own line above the name — two short lines fit where one long one would be
  // cut off, which is what keeps full names readable on a busy wheel.
  const labelOuter = r * 0.975
  const maxLabelW = labelOuter - (hub + 6)
  // Chord height at the label radius. Clamped at a half-turn: past that the
  // chord shrinks again (a lone entry spanning the full circle would measure 0)
  // even though the space available only ever grows.
  const arcH = 2 * Math.sin(Math.min(seg, Math.PI) / 2) * (r * 0.7)
  const twoLine = arcH >= 30 && n <= 60
  const nameFont = twoLine
    ? Math.min(30, Math.max(9, arcH * 0.4))
    : Math.min(24, Math.max(7, arcH * 0.52))
  const numFont = Math.max(8, nameFont * 0.7)
  // How far a single long name may shrink before it gets an ellipsis instead.
  // An absolute readability floor, not a fraction of the base: on a small pool
  // the base is huge, and 60% of huge is still far bigger than a long name
  // needs — which truncated names that had plenty of room to fit.
  const minNameFont = Math.min(nameFont, Math.max(10, nameFont * 0.45))
  const showLabels = nameFont >= 8.5

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
      const num = e.drawNumber ? String(e.drawNumber) : ''
      ctx.save()
      ctx.rotate(a0 + seg / 2)
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#fff'
      ctx.shadowColor = 'rgba(0,0,0,0.4)'
      ctx.shadowBlur = 2
      if (twoLine && num) {
        // Draw number above, slightly dimmed; the name gets the room and weight.
        ctx.font = font(600, numFont)
        ctx.globalAlpha = 0.8
        ctx.fillText(fitText(ctx, num, maxLabelW), labelOuter, -nameFont * 0.5)
        ctx.globalAlpha = 1
        // Offsets stay keyed to the base size, so the two lines sit on the same
        // rails across every segment even when one name shrank to fit.
        fitFont(ctx, e.fullName, maxLabelW, nameFont, minNameFont, 700)
        ctx.fillText(fitText(ctx, e.fullName, maxLabelW), labelOuter, numFont * 0.58)
      } else {
        const label = [num, e.fullName].filter(Boolean).join(' · ')
        fitFont(ctx, label, maxLabelW, nameFont, minNameFont, 600)
        ctx.fillText(fitText(ctx, label, maxLabelW), labelOuter, 0)
      }
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

export default function SpinWheel({
  entries,
  onWinner,
  onSpinningChange,
  spinToken = 0,
  disabled = false,
  // How wide the wheel may grow. The card view caps it; the expanded "stage"
  // view passes a viewport-derived size so it fills the screen.
  maxSize = 520,
  // Stage view sits on a dark backdrop, so the readout inverts.
  theater = false,
}) {
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

  // Track the container width so the wheel is crisp at every breakpoint. Re-runs
  // when maxSize changes (expanding to the stage view) — observe() fires once
  // straight away, so the new cap is applied without waiting for a resize.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      if (w > 0) setSize(Math.round(Math.min(w, maxSize)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [maxSize])

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
  const hubSize = hubRadius(size) * 2
  const pointerW = Math.max(34, size * 0.075)

  return (
    <div className="flex flex-col items-center">
      <div ref={wrapRef} className="relative w-full" style={{ maxWidth: maxSize }}>
        <div className="relative mx-auto" style={{ width: size, height: size }}>
          {/* Pointer — fixed at 12 o'clock, dipping into the rim. */}
          <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1">
            <svg width={pointerW} height={pointerW * 1.24} viewBox="0 0 34 42" aria-hidden="true">
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
            style={{ width: hubSize, height: hubSize }}
          >
            {spinning ? (
              <span
                className="animate-spin rounded-full border-[3px] border-white/40 border-t-white"
                style={{ width: hubSize * 0.3, height: hubSize * 0.3 }}
              />
            ) : (
              <span
                className="text-center font-extrabold uppercase leading-tight tracking-wide"
                style={{ fontSize: Math.max(13, size * 0.032) }}
              >
                Play
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Live readout — the name passing under the pointer right now. */}
      <div className="mt-5 w-full" style={{ maxWidth: maxSize }}>
        <div
          className={`rounded-2xl border text-center transition ${theater ? 'px-6 py-4' : 'px-4 py-3'} ${
            theater
              ? spinning
                ? 'border-as-red/50 bg-white/10'
                : 'border-white/15 bg-white/5'
              : spinning
                ? 'border-as-red/30 bg-as-red/5'
                : 'border-black/10 bg-white'
          }`}
        >
          <p
            className={`font-semibold uppercase tracking-wider ${
              theater ? 'text-xs text-white/50' : 'text-[11px] text-as-charcoal/45'
            }`}
          >
            {spinning ? 'Spinning…' : count > 0 ? 'Ready to draw' : 'No entries yet'}
          </p>
          <p
            className={`mt-0.5 truncate font-extrabold ${
              theater ? 'text-2xl text-white sm:text-3xl' : 'text-lg text-as-charcoal'
            }`}
          >
            {current ? (
              <>
                {current.drawNumber && (
                  <span
                    className={`mr-2 rounded-md px-1.5 py-0.5 tabular-nums ${
                      theater ? 'bg-white/15 text-lg text-white sm:text-2xl' : 'bg-as-red/10 text-sm text-as-red'
                    }`}
                  >
                    {current.drawNumber}
                  </span>
                )}
                {current.fullName}
              </>
            ) : (
              <span className={theater ? 'text-white/30' : 'text-as-charcoal/35'}>—</span>
            )}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={spin}
            disabled={!canSpin}
            className={`rounded-full font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
              theater
                ? 'bg-as-red px-8 py-3 text-base text-white hover:bg-as-red-light'
                : 'bg-as-charcoal px-6 py-2.5 text-sm text-white hover:bg-as-charcoal/85'
            }`}
          >
            {spinning ? 'Spinning…' : 'Spin the wheel'}
          </button>
          <button
            type="button"
            onClick={() => setSound((s) => !s)}
            aria-pressed={sound}
            title={sound ? 'Sound on' : 'Sound off'}
            className={`grid h-10 w-10 place-items-center rounded-full border transition ${
              theater
                ? 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                : 'border-black/10 bg-white text-as-charcoal/70 hover:text-as-red'
            }`}
          >
            {sound ? '🔊' : '🔇'}
          </button>
        </div>
      </div>
    </div>
  )
}
