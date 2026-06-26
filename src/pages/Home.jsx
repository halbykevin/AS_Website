import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import Icon from '../components/Icon.jsx'
import BannerSlider from '../components/BannerSlider.jsx'
import HorizontalStory from '../components/HorizontalStory.jsx'
import { useContent } from '../store/content.jsx'

// The same full-bleed aspect ratio used by the HorizontalStory and the events
// BannerSlider — so all three homepage strips are exactly the same height and
// width at every breakpoint.
const STRIP = 'aspect-[16/9] sm:aspect-[16/6] lg:aspect-[16/5]'

// Minimal homepage landing: the scroll-story, the events banner, then the
// "What We Do" strip — three equally sized, softly-rounded panels with smooth
// gaps between them (on the white page). No footer here (hidden in Layout).
export default function Home() {
  const { story, banners, services, about, brand } = useContent()

  return (
    <div className="space-y-3 px-2 py-3 sm:space-y-5 sm:px-4 sm:py-5">
      {/* 1 — Horizontal scroll-story */}
      <HorizontalStory story={story} />

      {/* 2 — Events banner (click any slide → /events) */}
      <BannerSlider banners={banners} />

      {/* 3 — What We Do */}
      <WhatWeDoSection services={services} about={about} brand={brand} />
    </div>
  )
}

// A full-bleed "What We Do" panel, the same size as the story + events banner,
// with a living background and centered editorial copy: a big heading and a
// typewriter that types out what AS Company does, plus a button.
function WhatWeDoSection({ services, about, brand }) {
  const reduce = useReducedMotion()
  const words = (Array.isArray(services.items) ? services.items : [])
    .map((i) => i?.title)
    .filter(Boolean)
  const stats = Array.isArray(about.stats) ? about.stats : []

  return (
    <section aria-label={services.heading || 'What We Do'} className="relative w-full">
      <div className={`relative w-full overflow-hidden rounded-[28px] shadow-xl shadow-black/10 sm:rounded-[36px] ${STRIP}`}>
        {/* Layered living background */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 130% at 18% 0%, #4a1d20 0%, #2c3133 42%, #15181a 100%)',
          }}
        />
        {/* Drifting brand glows */}
        <div
          className="pointer-events-none absolute -left-24 -top-10 h-72 w-72 rounded-full bg-as-red/40 blur-3xl motion-safe:animate-float"
        />
        <div
          className="pointer-events-none absolute -bottom-16 -right-16 h-80 w-80 rounded-full bg-as-red-light/25 blur-3xl motion-safe:animate-float"
          style={{ animationDelay: '-3s', animationDuration: '8s' }}
        />

        {/* Content */}
        <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
          <h2 className="bg-gradient-to-br from-white via-white to-as-red-light bg-clip-text text-4xl font-black uppercase leading-[0.95] tracking-[-0.03em] text-transparent sm:text-6xl lg:text-7xl">
            {services.heading}
          </h2>

          {words.length > 0 && (
            <p className="mt-3 text-sm font-bold uppercase tracking-[0.22em] text-as-red-light sm:mt-4 sm:text-lg">
              <Typewriter words={words} reduce={reduce} />
            </p>
          )}

          {stats.length > 0 && (
            <div className="mt-5 hidden flex-wrap items-center justify-center gap-2 lg:flex">
              {stats.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-white/65 backdrop-blur"
                >
                  <span className="font-bold text-white">{s.value}</span>
                  {s.label}
                </span>
              ))}
            </div>
          )}

          <Link
            to="/what-we-do"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-as-red px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-as-red/30 transition hover:bg-as-red-light hover:shadow-xl hover:shadow-as-red/40 sm:mt-6 sm:px-8 sm:py-3"
          >
            Explore what we do
            <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
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
      {text || ' '}
      <span
        className="ml-0.5 inline-block w-[2px] translate-y-[2px] bg-current align-middle motion-safe:animate-blink"
        style={{ height: '1em' }}
      />
    </span>
  )
}
