import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'

// Shared reveal: text rises + fades when its panel becomes active, staggered
// child-by-child.
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

// How long each panel stays on screen before auto-advancing (ms).
const INTERVAL = 3500

// Per-panel image size (admin-controlled). Responsive: a larger share of the
// width on phones, a column width on desktop — so panels can differ in size on
// both. (SIZE_CARD is the aspect ratio used by the reduced-motion carousel.)
const SIZE = {
  sm: 'w-[34%] max-w-[8rem] sm:w-[26%] sm:max-w-xs',
  md: 'w-[42%] max-w-[10rem] sm:w-[38%] sm:max-w-sm',
  lg: 'w-[50%] max-w-[12rem] sm:w-[48%] sm:max-w-md',
  xl: 'w-[58%] max-w-[14rem] sm:w-[58%] sm:max-w-lg',
}
const SIZE_CARD = {
  sm: 'aspect-[4/3]',
  md: 'aspect-square',
  lg: 'aspect-[4/5]',
  xl: 'aspect-[3/4]',
}

// ---------------------------------------------------------------------------
// Horizontal story — a self-playing, fixed-height showcase at the top of the
// homepage. Panels (big typography + image) auto-advance on a timer and travel
// horizontally, looping forever, with light reveals + a typewriter heading on
// the active panel. It pauses on hover and has clickable dots. Reduced-motion
// users get a plain static swipe carousel instead.
// ---------------------------------------------------------------------------

const DARK = '#0b0b0c'
const DEFAULT_ACCENT = '#A41E22' // as-red

export default function HorizontalStory({ story }) {
  const reduce = useReducedMotion()
  if (!story || !story.panels?.length) return null
  return reduce ? <CarouselStory story={story} /> : <AutoStory story={story} />
}

// ---- Auto-playing horizontal story ----------------------------------------
function AutoStory({ story }) {
  const panels = story.panels
  const n = panels.length
  const wrapRef = useRef(null)
  const [w, setW] = useState(0)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  // Track the stage width so the track travels exactly one panel per step
  // (matching the scroll container, not the window — avoids scrollbar overflow).
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Auto-advance on a timer; pause on hover.
  useEffect(() => {
    if (paused || n < 2) return
    const id = setInterval(() => setIndex((i) => (i + 1) % n), INTERVAL)
    return () => clearInterval(id)
  }, [paused, n])

  return (
    <section
      aria-label={story.heading || 'Story'}
      className="relative mb-2 overflow-hidden sm:mb-3"
      style={{ background: DARK }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div ref={wrapRef} className="relative h-[50svh] min-h-[360px] max-h-[520px] w-full overflow-hidden sm:h-[42svh] sm:min-h-[300px] sm:max-h-[460px]">
        <motion.div
          className="flex h-full will-change-transform"
          style={{ width: w ? w * n : '100%' }}
          animate={{ x: -(index * w) }}
          transition={{ duration: 0.9, ease: EASE }}
        >
          {panels.map((p, i) => (
            <StoryPanel key={p.id ?? i} panel={p} width={w} flip={i % 2 === 1} active={i === index} />
          ))}
        </motion.div>

        {/* Fixed section label */}
        <div className="pointer-events-none absolute left-5 top-5 sm:left-8 sm:top-8">
          {story.eyebrow && (
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/80">
              {story.eyebrow}
            </span>
          )}
          {story.heading && <h2 className="mt-3 max-w-xs text-lg font-bold text-white/90">{story.heading}</h2>}
        </div>

        {/* Panel dots */}
        {n > 1 && (
          <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 gap-2">
            {panels.map((p, i) => (
              <button
                key={p.id ?? i}
                type="button"
                aria-label={`Go to panel ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index ? 'w-6 bg-as-red' : 'w-2 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        )}
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

// One full-stage panel. Memoised; its reveals/typewriter run from the `active`
// flag (set by the auto-player) rather than from scroll position.
const StoryPanel = memo(function StoryPanel({ panel, width, flip, active }) {
  const { c1, hasGradient, gradient } = panelColors(panel)

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
    <div className="relative flex h-full shrink-0 items-center" style={{ width: width || '100vw' }}>
      <div
        className={`mx-auto flex w-full max-w-6xl flex-col-reverse items-center gap-4 px-6 text-center sm:flex-row sm:gap-12 sm:px-10 sm:text-left ${
          flip ? 'sm:flex-row-reverse' : ''
        }`}
      >
        <div className="w-full sm:flex-1">
          <motion.div variants={stagger} initial="hidden" animate={active ? 'show' : 'hidden'}>
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
              className={`mt-3 text-2xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl ${hasGradient ? '' : 'text-white'}`}
              style={headingStyle}
            >
              <Typewriter text={panel.heading} run={active} caretColor={hasGradient ? c1 : 'currentColor'} />
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
        </div>

        <div className={`relative aspect-[4/5] shrink-0 translate-y-6 sm:translate-y-0 ${SIZE[panel.size] || SIZE.md}`}>
          {/* Soft glow via a radial gradient — cheap, no expensive blur filter. */}
          <div
            className="pointer-events-none absolute -inset-8 rounded-[50%]"
            style={{ background: `radial-gradient(closest-side, ${c1}, transparent)`, opacity: 0.18 }}
          />
          <motion.div
            className="relative h-full w-full overflow-hidden rounded-3xl"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={active ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.6, ease: EASE }}
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

// Types its text out character-by-character whenever `run` becomes true, with a
// blinking caret. Reduced-motion users get the full text instantly.
function Typewriter({ text = '', speed = 45, className = '', caretColor = 'currentColor', run = true }) {
  const reduce = useReducedMotion()
  const [count, setCount] = useState(0)
  const done = count >= text.length

  useEffect(() => {
    if (reduce) return setCount(text.length)
    if (!run) return setCount(0)
    setCount(0)
    let i = 0
    const id = setInterval(() => {
      i += 1
      setCount(i)
      if (i >= text.length) clearInterval(id)
    }, speed)
    return () => clearInterval(id)
  }, [run, text, speed, reduce])

  return (
    <span aria-label={text} className={className}>
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
