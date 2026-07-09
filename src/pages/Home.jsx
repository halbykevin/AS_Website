import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import BannerSlider from '../components/BannerSlider.jsx'
import HorizontalStory from '../components/HorizontalStory.jsx'
import { useContent } from '../store/content.jsx'

// The same full-bleed aspect ratio used by the HorizontalStory and the events
// BannerSlider — so all three homepage strips are exactly the same height and
// width at every breakpoint. The shorter mobile ratio lets all three panels fit
// on one phone screen without vertical scrolling.
const STRIP = 'aspect-[16/7] sm:aspect-[16/6] lg:aspect-[16/5]'

// Smooth shadow + a gentle "clickable" breathing pulse (pauses on hover, off for
// reduced-motion). Shared by all three homepage panels.
const PANEL =
  'rounded-[28px] shadow-2xl shadow-black/10 transition-shadow duration-500 hover:shadow-black/20 motion-safe:animate-pulse-soft hover:[animation-play-state:paused] sm:rounded-[36px]'

// Minimal homepage landing: three equally sized, softly-rounded panels with
// smooth gaps. No footer here (hidden in Layout for the home route).
export default function Home() {
  const { story, banners, services } = useContent()

  return (
    <div className="space-y-3 px-2 py-3 sm:space-y-5 sm:px-4 sm:py-5">
      {/* 1 — Horizontal scroll-story */}
      <HorizontalStory story={story} />

      {/* 2 — Events banner (click any slide → /events) */}
      <BannerSlider banners={banners} />

      {/* 3 — What We Do */}
      <WhatWeDoSection services={services} />
    </div>
  )
}

// A light, lively "What We Do" panel — same size as the other two. An animated
// red→white particle-line field sits behind centered animated typography, and
// the whole panel is a clickable link into the full What We Do page.
function WhatWeDoSection({ services }) {
  const reduce = useReducedMotion()
  const words = (Array.isArray(services.items) ? services.items : [])
    .map((i) => i?.title)
    .filter(Boolean)

  return (
    <section aria-label={services.heading || 'What We Do'} className="relative w-full">
      <Link
        to="/what-we-do"
        aria-label={`${services.heading || 'What We Do'} — explore`}
        className={`relative block w-full overflow-hidden ${PANEL} ${STRIP}`}
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
