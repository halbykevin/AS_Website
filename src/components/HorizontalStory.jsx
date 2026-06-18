import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useInView, useMotionValue, useTransform } from 'framer-motion'
import { useScrollEl } from '../store/scroll.jsx'

// Shared scroll-in reveal: text rises + fades as a panel enters view, staggered
// child-by-child. Plays on every size (the pinned section runs on mobile too).
const EASE = [0.22, 0.7, 0.3, 1]
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } } }
const riseItem = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
}
const scaleItem = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE } },
}

// Per-panel image size (admin-controlled). Responsive: a larger share of the
// width on phones, a column width on desktop — so panels can differ in size on
// both. (SIZE_CARD is the aspect ratio used by the reduced-motion carousel.)
const SIZE = {
  sm: 'w-[52%] max-w-[12rem] sm:w-[26%] sm:max-w-xs',
  md: 'w-[64%] max-w-[15rem] sm:w-[38%] sm:max-w-sm',
  lg: 'w-[76%] max-w-[18rem] sm:w-[48%] sm:max-w-md',
  xl: 'w-[88%] max-w-[22rem] sm:w-[58%] sm:max-w-lg',
}
const SIZE_CARD = {
  sm: 'aspect-[4/3]',
  md: 'aspect-square',
  lg: 'aspect-[4/5]',
  xl: 'aspect-[3/4]',
}

// ---------------------------------------------------------------------------
// Horizontal scroll-story — a GSAP-style pinned section. On every screen size
// (desktop AND mobile) the section sticks to the viewport and vertical scrolling
// is translated into horizontal travel of the panels (big typography + images),
// with light parallax and scroll-in reveals. Only reduced-motion users get a
// plain static carousel.
//
// IMPORTANT: the public site scrolls inside a container (Layout's scrollRef),
// not the window — so the scroll math reads that element via useScrollEl().
// ---------------------------------------------------------------------------

const DARK = '#0b0b0c'
const DEFAULT_ACCENT = '#A41E22' // as-red

export default function HorizontalStory({ story }) {
  // Pin on all sizes; only reduced-motion users fall back to a static carousel.
  const [pinned, setPinned] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPinned(!rm.matches)
    rm.addEventListener('change', update)
    return () => rm.removeEventListener('change', update)
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

  const overflow = dims.w * (n - 1) // total horizontal distance to travel

  // Scroll progress lives in a motion value, NOT React state — updating it on
  // scroll drives the transforms straight on the compositor with zero React
  // re-renders, which keeps it smooth on mobile.
  const progress = useMotionValue(0)
  const trackX = useTransform(progress, (p) => -(p * overflow))

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
        if (!wrap || overflow <= 0) return progress.set(0)
        const rel = wrap.getBoundingClientRect().top - sc.getBoundingClientRect().top
        progress.set(Math.min(1, Math.max(0, -rel / overflow)))
      })
    }
    onScroll()
    sc.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      sc.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scrollRef, overflow, progress])

  return (
    <section
      ref={wrapRef}
      aria-label={story.heading || 'Story'}
      className="relative"
      style={{ height: dims.h ? dims.h + overflow : undefined, background: DARK }}
    >
      <div className="sticky top-0 overflow-hidden" style={{ height: dims.h || '100dvh' }}>
        <motion.div
          className="flex h-full will-change-transform"
          style={{ width: dims.w ? dims.w * n : '100%', x: trackX }}
        >
          {panels.map((p, i) => (
            <StoryPanel
              key={p.id ?? i}
              panel={p}
              width={dims.w}
              index={i}
              overflow={overflow}
              progress={progress}
              flip={i % 2 === 1}
            />
          ))}
        </motion.div>

        {/* Fixed section label */}
        <div className="pointer-events-none absolute left-5 top-5 sm:left-8 sm:top-8">
          {story.eyebrow && (
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/80 backdrop-blur">
              {story.eyebrow}
            </span>
          )}
          {story.heading && <h2 className="mt-3 max-w-xs text-lg font-bold text-white/90">{story.heading}</h2>}
        </div>

        {/* Scroll progress bar (scaleX is composited — no layout thrash) */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
          <motion.div className="h-full origin-left bg-as-red" style={{ scaleX: progress }} />
        </div>
      </div>
    </section>
  )
}

// Resolve a panel's accent into a solid colour or a 2-colour gradient.
function panelColors(panel) {
  const c1 = panel.accent || DEFAULT_ACCENT
  const c2 = panel.accent2
  const type = panel.gradientType || 'linear'
  const hasGradient = Boolean(c2) && type !== 'solid'
  const gradient = !hasGradient
    ? c1
    : type === 'radial'
      ? `radial-gradient(circle at 30% 30%, ${c1}, ${c2})`
      : `linear-gradient(120deg, ${c1}, ${c2})`
  return { c1, hasGradient, gradient }
}

// One full-screen panel with parallaxing text + image. Memoised + driven by the
// shared `progress` motion value, so scrolling never re-renders it in React.
const StoryPanel = memo(function StoryPanel({ panel, width, index, overflow, progress, flip }) {
  const { c1, hasGradient, gradient } = panelColors(panel)

  // Parallax + dimming derived from scroll progress (compositor-driven, no
  // React re-render). `delta` is 0 when this panel is centred.
  const delta = (p) => (width ? index * width - p * overflow : 0)
  const imgX = useTransform(progress, (p) => -delta(p) * 0.12)
  const textX = useTransform(progress, (p) => delta(p) * 0.04)
  const opacity = useTransform(progress, (p) => 1 - (width ? Math.min(1, Math.abs(delta(p)) / width) : 0) * 0.5)

  const image = panel.image ? (
    <img src={panel.image} alt={panel.heading || ''} draggable={false} className="h-full w-full object-cover" />
  ) : (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: hasGradient ? gradient : `linear-gradient(135deg, ${c1}55, ${c1}10)` }}
    >
      <span className="px-6 text-center text-xl font-bold uppercase tracking-wide text-white/80">{panel.heading}</span>
    </div>
  )

  const headingStyle = hasGradient
    ? { backgroundImage: gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
    : undefined

  return (
    <motion.div className="relative flex h-full shrink-0 items-center" style={{ width: width || '100vw', opacity }}>
      <div
        className={`mx-auto flex w-full max-w-6xl flex-col-reverse items-center gap-7 px-6 text-center sm:flex-row sm:gap-12 sm:px-10 sm:text-left ${
          flip ? 'sm:flex-row-reverse' : ''
        }`}
      >
        {/* Parallax (x) is on this motion wrapper; the reveal stagger is inside. */}
        <motion.div className="w-full sm:flex-1" style={{ x: textX }}>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: false, amount: 0.4 }}
          >
            {panel.caption && (
              <motion.span
                variants={riseItem}
                className="block text-sm font-semibold uppercase tracking-widest"
                style={{ color: c1 }}
              >
                {panel.caption}
              </motion.span>
            )}
            <h3
              className={`mt-3 text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl ${hasGradient ? '' : 'text-white'}`}
              style={headingStyle}
            >
              <Typewriter text={panel.heading} caretColor={hasGradient ? c1 : 'currentColor'} />
            </h3>
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
        </motion.div>

        <motion.div
          className={`relative aspect-[4/5] shrink-0 ${SIZE[panel.size] || SIZE.md}`}
          style={{ x: imgX }}
        >
          <div className="pointer-events-none absolute -inset-6 rounded-full blur-3xl" style={{ background: gradient, opacity: 0.08 }} />
          <motion.div
            className="relative h-full w-full overflow-hidden rounded-3xl"
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
        </motion.div>
      </div>
    </motion.div>
  )
})

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
      className="overflow-hidden rounded-3xl bg-white/[0.04]"
      variants={stagger}
      initial={reduce ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: false, amount: 0.35 }}
    >
      <motion.div
        variants={scaleItem}
        className={`relative w-full overflow-hidden ${SIZE_CARD[panel.size] || SIZE_CARD.md}`}
      >
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
      </motion.div>
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

// Types its text out character-by-character the first time it scrolls into
// view, with a blinking caret. Reduced-motion users get the full text instantly.
function Typewriter({ text = '', speed = 45, className = '', caretColor = 'currentColor' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReducedMotion()
  const [count, setCount] = useState(0)
  const done = count >= text.length

  useEffect(() => {
    if (reduce) return setCount(text.length)
    if (!inView) return
    setCount(0)
    let i = 0
    const id = setInterval(() => {
      i += 1
      setCount(i)
      if (i >= text.length) clearInterval(id)
    }, speed)
    return () => clearInterval(id)
  }, [inView, text, speed, reduce])

  return (
    <span ref={ref} aria-label={text} className={className}>
      <span aria-hidden="true">{text.slice(0, count)}</span>
      {/* Caret shows only while typing — it disappears once the line finishes. */}
      {!reduce && !done && (
        <span
          aria-hidden="true"
          className="ml-[0.06em] inline-block w-[0.5ch] align-baseline"
          style={{ background: caretColor, height: '0.95em', transform: 'translateY(0.12em)' }}
        />
      )}
    </span>
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
