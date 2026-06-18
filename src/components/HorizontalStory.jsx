import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useScrollEl } from '../store/scroll.jsx'

// Shared scroll-in reveal: text rises + fades as a panel enters view, staggered
// child-by-child. Plays on desktop (pinned) and mobile (carousel) alike.
const EASE = [0.22, 0.7, 0.3, 1]
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } } }
const riseItem = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
}

// ---------------------------------------------------------------------------
// Horizontal scroll-story — a GSAP-style pinned section. On desktop the section
// sticks to the viewport and vertical scrolling is translated into horizontal
// travel of the panels (big typography + images), with light parallax. On
// mobile (or with reduced motion) it falls back to a swipeable carousel.
//
// IMPORTANT: the public site scrolls inside a container (Layout's scrollRef),
// not the window — so the scroll math reads that element via useScrollEl().
// ---------------------------------------------------------------------------

const DARK = '#0b0b0c'
const DEFAULT_ACCENT = '#A41E22' // as-red

export default function HorizontalStory({ story }) {
  // Pin only on a wide viewport with motion allowed; otherwise carousel.
  const [pinned, setPinned] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 768px)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPinned(mq.matches && !rm.matches)
    mq.addEventListener('change', update)
    rm.addEventListener('change', update)
    return () => {
      mq.removeEventListener('change', update)
      rm.removeEventListener('change', update)
    }
  }, [])

  if (!story || !story.panels?.length) return null
  return pinned ? <PinnedStory story={story} /> : <CarouselStory story={story} />
}

// ---- Desktop: pinned horizontal scroll ------------------------------------
function PinnedStory({ story }) {
  const scrollRef = useScrollEl()
  const wrapRef = useRef(null)
  const panels = story.panels
  const n = panels.length
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [progress, setProgress] = useState(0)

  const overflow = dims.w * (n - 1) // total horizontal distance to travel

  // The pinned stage matches the scroll container's visible size.
  useLayoutEffect(() => {
    const sc = scrollRef?.current
    if (!sc) return
    const measure = () => setDims({ w: sc.clientWidth, h: sc.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(sc)
    return () => ro.disconnect()
  }, [scrollRef])

  // Convert the container's scroll position into 0..1 progress.
  useEffect(() => {
    const sc = scrollRef?.current
    if (!sc) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const wrap = wrapRef.current
        if (!wrap || overflow <= 0) return setProgress(0)
        const rel = wrap.getBoundingClientRect().top - sc.getBoundingClientRect().top
        setProgress(Math.min(1, Math.max(0, -rel / overflow)))
      })
    }
    onScroll()
    sc.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      sc.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scrollRef, overflow])

  const translateX = -(progress * overflow)

  return (
    <section
      ref={wrapRef}
      aria-label={story.heading || 'Story'}
      className="relative"
      style={{ height: dims.h ? dims.h + overflow : undefined, background: DARK }}
    >
      <div className="sticky top-0 overflow-hidden" style={{ height: dims.h || '100dvh' }}>
        <div
          className="flex h-full will-change-transform"
          style={{ width: dims.w ? dims.w * n : '100%', transform: `translate3d(${translateX}px,0,0)` }}
        >
          {panels.map((p, i) => {
            const delta = dims.w ? i * dims.w + translateX : 0 // 0 when this panel is centered
            return <StoryPanel key={p.id ?? i} panel={p} width={dims.w} delta={delta} flip={i % 2 === 1} />
          })}
        </div>

        {/* Fixed section label */}
        <div className="pointer-events-none absolute left-5 top-5 sm:left-8 sm:top-8">
          {story.eyebrow && (
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/80 backdrop-blur">
              {story.eyebrow}
            </span>
          )}
          {story.heading && <h2 className="mt-3 max-w-xs text-lg font-bold text-white/90">{story.heading}</h2>}
        </div>

        {/* Scroll progress bar */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
          <div className="h-full bg-as-red" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </section>
  )
}

// One full-screen panel with parallaxing text + image.
function StoryPanel({ panel, width, delta, flip }) {
  const accent = panel.accent || DEFAULT_ACCENT
  const imgShift = -delta * 0.12
  const textShift = delta * 0.04
  const off = width ? Math.min(1, Math.abs(delta) / width) : 0
  const opacity = 1 - off * 0.5

  const image = panel.image ? (
    <img src={panel.image} alt={panel.heading || ''} draggable={false} className="h-full w-full object-cover" />
  ) : (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${accent}33, #ffffff10)` }}
    >
      <span className="px-6 text-center text-xl font-bold uppercase tracking-wide text-white/70">{panel.heading}</span>
    </div>
  )

  return (
    <div className="relative flex h-full shrink-0 items-center" style={{ width: width || '100vw', opacity }}>
      <div
        className={`mx-auto flex w-full max-w-6xl items-center gap-8 px-6 sm:gap-12 sm:px-10 ${
          flip ? 'flex-row-reverse' : ''
        }`}
      >
        {/* Parallax wrapper (transform) is separate from the motion wrapper so
            the two don't fight over `transform`. */}
        <div className="flex-1" style={{ transform: `translateX(${textShift}px)` }}>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.5 }}
          >
            {panel.caption && (
              <motion.span
                variants={riseItem}
                className="block text-sm font-semibold uppercase tracking-widest"
                style={{ color: accent }}
              >
                {panel.caption}
              </motion.span>
            )}
            <motion.h3
              variants={riseItem}
              className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl"
            >
              {panel.heading}
            </motion.h3>
            {panel.link && (
              <motion.div variants={riseItem}>
                <PanelLink
                  to={panel.link}
                  className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-as-charcoal transition hover:bg-white/90"
                >
                  Explore →
                </PanelLink>
              </motion.div>
            )}
          </motion.div>
        </div>

        <div
          className="relative aspect-[4/5] w-[38%] max-w-sm shrink-0"
          style={{ transform: `translateX(${imgShift}px)` }}
        >
          <div className="pointer-events-none absolute -inset-6 rounded-full blur-3xl" style={{ background: `${accent}22` }} />
          <motion.div
            className="relative h-full w-full overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/10"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            {panel.link ? (
              <PanelLink to={panel.link} className="block h-full w-full">
                {image}
              </PanelLink>
            ) : (
              image
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

// ---- Mobile / reduced motion: swipe carousel ------------------------------
function CarouselStory({ story }) {
  return (
    <section aria-label={story.heading || 'Story'} className="py-12" style={{ background: DARK }}>
      <div className="mx-auto max-w-7xl px-5">
        {story.eyebrow && (
          <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/80">
            {story.eyebrow}
          </span>
        )}
        {story.heading && <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{story.heading}</h2>}
        {story.subheading && <p className="mt-2 max-w-xl text-sm text-white/55">{story.subheading}</p>}
      </div>

      <div className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {story.panels.map((p, i) => (
          <div key={p.id ?? i} className="w-[82%] shrink-0 snap-center sm:w-[60%]">
            <StoryCard panel={p} />
          </div>
        ))}
      </div>
    </section>
  )
}

function StoryCard({ panel }) {
  const accent = panel.accent || DEFAULT_ACCENT
  const reduce = useReducedMotion()
  const card = (
    <motion.div
      className="overflow-hidden rounded-3xl bg-white/[0.04] ring-1 ring-white/10"
      variants={stagger}
      initial={reduce ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {panel.image ? (
          <img src={panel.image} alt={panel.heading || ''} className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${accent}33, #ffffff10)` }}
          >
            <span className="px-4 text-center text-lg font-bold uppercase tracking-wide text-white/70">{panel.heading}</span>
          </div>
        )}
      </div>
      <div className="p-5">
        {panel.caption && (
          <motion.span variants={riseItem} className="block text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>
            {panel.caption}
          </motion.span>
        )}
        <motion.h3 variants={riseItem} className="mt-2 text-xl font-extrabold text-white">
          {panel.heading}
        </motion.h3>
      </div>
    </motion.div>
  )
  return panel.link ? (
    <PanelLink to={panel.link} className="block">
      {card}
    </PanelLink>
  ) : (
    card
  )
}

// A panel link: internal route (/path) → <Link>, external (https://) → <a>.
function PanelLink({ to, children, className }) {
  if (/^https?:\/\//i.test(to)) {
    return (
      <a href={to} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  )
}
