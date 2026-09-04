import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import BannerCta from '../components/BannerCta.jsx'
import TicketingPanel from '../components/TicketingPanel.jsx'
import StoreBanner from '../components/StoreBanner.jsx'
import { useContent } from '../store/content.jsx'

// Smooth shadow + a gentle "clickable" breathing pulse (pauses on hover, off for
// reduced-motion). Shared by all three homepage panels.
const PANEL =
  'rounded-[28px] shadow-2xl shadow-black/10 transition-shadow duration-500 hover:shadow-black/20 motion-safe:animate-pulse-soft hover:[animation-play-state:paused] sm:rounded-[36px]'

// The three homepage strips share one height, set by the admin as the aspect
// ratio 16 : N (bannerHeight). Higher N = taller. Falls back to 6 if unset.
export function stripStyle(bannerHeight) {
  const n = Number(bannerHeight) > 0 ? Number(bannerHeight) : 6
  return { aspectRatio: `16 / ${n}` }
}

// Homepage landing: three softly-rounded panels.
//  • Mobile — stacked vertically. The events and What We Do strips take the
//    admin-set 16:N aspect ratio; the store slideshow sets its own (taller) one,
//    because product cards don't fit in a letterbox.
//  • Desktop (md+) — a bento grid so all three are visible at once: the Events
//    banner takes the tall left column, with the Store slideshow and What We Do
//    stacked on the right.
export default function Home() {
  const { storeBanner, services, bannerHeight } = useContent()

  return (
    <>
      {/* Mobile: stacked strips (unchanged) */}
      <div className="space-y-3 px-2 py-3 sm:space-y-5 sm:px-4 sm:py-5 md:hidden">
        <StoreBanner banner={storeBanner} height={bannerHeight} />
        <TicketingPanel height={bannerHeight} />
        <WhatWeDoSection services={services} height={bannerHeight} />
      </div>

      {/* Desktop: bento grid — all three panels in one view, filling the space
          between the nav and the footer so there's no dead white band below. */}
      <div className="hidden px-4 py-5 md:flex md:flex-1 md:flex-col">
        <div className="grid min-h-[26rem] flex-1 grid-cols-3 grid-rows-2 gap-5">
          {/* Store slideshow — tall spotlight on the left */}
          <div className="col-span-2 row-span-2 min-h-0">
            <StoreBanner banner={storeBanner} height={bannerHeight} fill />
          </div>
          {/* Events banner — top right */}
          <div className="min-h-0">
            <TicketingPanel height={bannerHeight} fill />
          </div>
          {/* What We Do — bottom right */}
          <div className="min-h-0">
            <WhatWeDoSection services={services} height={bannerHeight} fill />
          </div>
        </div>
      </div>
    </>
  )
}

// A light, lively "What We Do" panel — same size as the other two. An animated
// red→white particle-line field sits behind centered animated typography, and
// the whole panel is a clickable link into the full What We Do page.
function WhatWeDoSection({ services, height, fill = false }) {
  const reduce = useReducedMotion()
  const words = (Array.isArray(services.items) ? services.items : [])
    .map((i) => i?.title)
    .filter(Boolean)

  return (
    <section aria-label={services.heading || 'What We Do'} className={`relative w-full ${fill ? 'h-full' : ''}`}>
      <Link
        to="/what-we-do"
        aria-label={`${services.heading || 'What We Do'} — explore`}
        className={`relative block w-full overflow-hidden ${PANEL} ${fill ? 'h-full' : ''}`}
        style={fill ? undefined : stripStyle(height)}
      >
        {/* Soft off-white base (not pure white) */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 130% at 50% 0%, #ffffff 0%, #fdeff1 70%, #fbe6e8 100%)' }}
        />
        {/* Animated red→white particle network */}
        <ParticleField reduce={reduce} className="absolute inset-0 h-full w-full" />

        {/* Centered animated typography */}
        <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
          <h2 className="bg-gradient-to-br from-as-charcoal via-as-charcoal to-as-red bg-clip-text text-4xl font-black uppercase leading-[0.95] tracking-[-0.03em] text-transparent sm:text-6xl lg:text-7xl">
            {services.heading}
          </h2>

          {words.length > 0 && (
            <p className="mt-3 text-sm font-bold uppercase tracking-[0.22em] text-as-red sm:mt-4 sm:text-lg">
              <Typewriter words={words} reduce={reduce} />
            </p>
          )}
        </div>
      </Link>

      {/* Explore now — a sibling of the panel link, never a child: an <a> inside
          an <a> is invalid and gets un-nested by the browser. Same destination
          as the panel, just stated outright. */}
      <BannerCta href="/what-we-do" label="Explore now" />
    </section>
  )
}

// Lightweight canvas particle network. Points drift and connect with lines whose
// colour breathes from brand red toward white. Pauses when off-screen; draws a
// single static frame for reduced-motion visitors.
function ParticleField({ className = '', reduce = false }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = 0
    let w = 0
    let h = 0
    let dpr = 1
    let t = 0
    let running = true
    const pts = []
    const COUNT = 46
    const MAXD = 130
    const RED = [164, 30, 34]
    const LIGHT = [246, 216, 218]
    const lerp = (a, b, k) => a + (b - a) * k

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const init = () => {
      pts.length = 0
      for (let i = 0; i < COUNT; i++) {
        pts.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
        })
      }
    }
    const frame = () => {
      t += 0.004
      const k = (Math.sin(t) + 1) / 2 // red ↔ white, slowly
      const r = lerp(RED[0], LIGHT[0], k) | 0
      const g = lerp(RED[1], LIGHT[1], k) | 0
      const b = lerp(RED[2], LIGHT[2], k) | 0
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j]
          const dx = p.x - q.x
          const dy = p.y - q.y
          const d = Math.hypot(dx, dy)
          if (d < MAXD) {
            ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - d / MAXD) * 0.4})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(q.x, q.y)
            ctx.stroke()
          }
        }
      }
      for (const p of pts) {
        ctx.fillStyle = `rgba(${r},${g},${b},0.8)`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.7, 0, 6.2832)
        ctx.fill()
      }
      if (running && !reduce) raf = requestAnimationFrame(frame)
    }

    resize()
    init()
    frame()
    const ro = new ResizeObserver(() => {
      resize()
      init()
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => {
      running = e.isIntersecting
      if (running && !reduce) {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(frame)
      }
    })
    io.observe(canvas)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [reduce])

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none ${className}`} />
}

// Types each word out, holds, deletes, then moves to the next — looping forever
// with a blinking caret. Reduced-motion visitors get the first word, static.
function Typewriter({ words, reduce }) {
  const [idx, setIdx] = useState(0)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState('typing') // typing | holding | deleting

  useEffect(() => {
    if (reduce) {
      setText(words[0] || '')
      return
    }
    const word = words[idx % words.length] || ''
    let t
    if (phase === 'typing') {
      if (text.length < word.length) t = setTimeout(() => setText(word.slice(0, text.length + 1)), 75)
      else t = setTimeout(() => setPhase('holding'), 1200)
    } else if (phase === 'holding') {
      t = setTimeout(() => setPhase('deleting'), 250)
    } else {
      if (text.length > 0) t = setTimeout(() => setText(word.slice(0, text.length - 1)), 40)
      else {
        setPhase('typing')
        setIdx((i) => (i + 1) % words.length)
      }
    }
    return () => clearTimeout(t)
  }, [text, phase, idx, words, reduce])

  return (
    <span>
      {text || ' '}
      <span
        className="ml-0.5 inline-block w-[2px] translate-y-[2px] bg-current align-middle motion-safe:animate-blink"
        style={{ height: '1em' }}
      />
    </span>
  )
}
