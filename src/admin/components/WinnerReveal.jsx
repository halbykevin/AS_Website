import { useEffect, useRef } from 'react'

// The winner announcement: a full-screen card showing the draw number and the
// full name, over a canvas confetti burst. Shown the moment the wheel settles.

const CONFETTI_COLORS = ['#A41E22', '#C53A3F', '#383F41', '#9A7B16', '#E8C547', '#ffffff']

// Lightweight canvas confetti — a few hundred rectangles under gravity. Cheaper
// and smoother than animating that many DOM nodes, and needs no dependency.
function Confetti() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined

    const ctx = canvas.getContext('2d')
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    // Two cannons, angled inwards from the bottom corners.
    const pieces = []
    for (let i = 0; i < 220; i++) {
      const fromLeft = i % 2 === 0
      const angle = (fromLeft ? -1.05 : -2.09) + (Math.random() - 0.5) * 0.7
      const speed = 12 + Math.random() * 13
      pieces.push({
        x: fromLeft ? w * 0.08 : w * 0.92,
        y: h * 1.02,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 7,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })
    }

    let raf = 0
    let alive = true
    const step = () => {
      ctx.clearRect(0, 0, w, h)
      let onScreen = 0
      for (const p of pieces) {
        p.vy += 0.34 // gravity
        p.vx *= 0.995
        p.vy *= 0.995
        p.x += p.vx
        p.y += p.vy
        p.rot += p.spin
        if (p.y < h + 40) onScreen++
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (onScreen > 0 && alive) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

    globalThis.addEventListener('resize', resize)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      globalThis.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
}

export default function WinnerReveal({ winner, onClose, onSpinAgain, onRemove }) {
  // Escape closes, and the reveal is announced to screen readers.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!winner) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-as-charcoal/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wheel-winner-name"
    >
      <Confetti />

      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white p-8 text-center shadow-2xl sm:p-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-as-red via-[#E8C547] to-as-red" />

        <p className="text-xs font-bold uppercase tracking-[0.2em] text-as-red">🎉 We have a winner</p>

        {winner.drawNumber && (
          <div className="mx-auto mt-6 inline-flex flex-col items-center rounded-2xl bg-as-red px-8 py-4 text-white shadow-lg">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">Draw number</span>
            <span className="text-4xl font-black tabular-nums leading-tight sm:text-5xl">{winner.drawNumber}</span>
          </div>
        )}

        <h2
          id="wheel-winner-name"
          aria-live="assertive"
          className="mt-6 break-words text-3xl font-black leading-tight text-as-charcoal sm:text-4xl"
        >
          {winner.fullName}
        </h2>

        {winner.wins > 1 && (
          <p className="mt-2 text-sm text-as-charcoal/50">Drawn {winner.wins} times in this round.</p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={onSpinAgain}
            className="rounded-full bg-as-red px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-as-red-light"
          >
            Spin again
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-as-charcoal transition hover:border-as-red/30 hover:text-as-red"
          >
            Remove &amp; spin again
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-as-charcoal/60 transition hover:text-as-charcoal"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
