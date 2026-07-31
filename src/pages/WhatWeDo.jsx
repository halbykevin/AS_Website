import { useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useReducedMotion,
  useMotionValue,
  useMotionTemplate,
} from 'framer-motion'
import Icon from '../components/Icon.jsx'
import Reveal from '../components/Reveal.jsx'
import { useContent } from '../store/content.jsx'
import { useScrollEl } from '../store/scroll.jsx'

// ---------------------------------------------------------------------------
// Motion helpers — bound to the app's custom scroll container (the site scrolls
// inside a box below the header, not the window; see Layout), and all collapse
// to static markup for reduced-motion visitors.
// ---------------------------------------------------------------------------

// Scroll-driven vertical drift for layered depth.
function Parallax({ children, className = '', from = 70, to = -70, as = 'div' }) {
  const ref = useRef(null)
  const container = useScrollEl()
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    container,
    offset: ['start end', 'end start'],
  })
  const y = useSpring(useTransform(scrollYProgress, [0, 1], [from, to]), {
    stiffness: 120,
    damping: 30,
    mass: 0.4,
  })
  const Tag = motion[as] || motion.div
  return (
    <Tag ref={ref} style={reduce ? undefined : { y }} className={className}>
      {children}
    </Tag>
  )
}

// A living red "aurora" — soft blobs that continuously morph position + scale.
// Pure decoration; sits behind content on the dark sections.
function Aurora() {
  const reduce = useReducedMotion()
  const common = 'pointer-events-none absolute rounded-full blur-[110px]'
  if (reduce) {
    return (
      <>
        <span className={`${common} -right-32 -top-24 h-[30rem] w-[30rem] bg-as-red/30`} />
        <span className={`${common} -bottom-32 -left-24 h-[26rem] w-[26rem] bg-as-red-light/20`} />
      </>
    )
  }
  return (
    <>
      <motion.span
        className={`${common} h-[32rem] w-[32rem] bg-as-red/35`}
        style={{ right: '-8rem', top: '-6rem' }}
        animate={{ x: [0, 60, -20, 0], y: [0, 40, -30, 0], scale: [1, 1.15, 0.95, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.span
        className={`${common} h-[28rem] w-[28rem] bg-as-red-light/25`}
        style={{ left: '-6rem', bottom: '-8rem' }}
        animate={{ x: [0, -40, 30, 0], y: [0, -30, 20, 0], scale: [1, 1.1, 0.9, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.span
        className={`${common} h-[22rem] w-[22rem] bg-white/[0.05]`}
        style={{ left: '40%', top: '30%' }}
        animate={{ x: [0, 30, -30, 0], y: [0, 20, -20, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />
    </>
  )
}

// Word-by-word rise-and-fade for the big hero heading.
function WordReveal({ text, className = '' }) {
  const reduce = useReducedMotion()
  const words = String(text).split(' ')
  if (reduce) return <span className={className}>{text}</span>
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: '115%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.3, 1], delay: 0.15 + i * 0.09 }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

// Interactive 3D card: tilts toward the cursor and lights a red glow that
// tracks the pointer. Falls back to a plain link for reduced motion.
function TiltCard({ to, index, icon, title, summary }) {
  const reduce = useReducedMotion()
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 })
  const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 })
  const gx = useMotionValue(50)
  const gy = useMotionValue(50)
  const glow = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(197,58,63,0.16), transparent 55%)`

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    ry.set((px - 0.5) * 12)
    rx.set(-(py - 0.5) * 12)
    gx.set(px * 100)
    gy.set(py * 100)
  }
  const onLeave = () => {
    rx.set(0)
    ry.set(0)
  }

  const inner = (
    <Link
      to={to}
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-black/[0.06] bg-white p-7 shadow-sm transition-shadow duration-300 hover:shadow-2xl hover:shadow-as-red/10"
    >
      {!reduce && (
        <motion.span
          aria-hidden
          style={{ background: glow }}
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      )}
      <span className="pointer-events-none absolute right-5 top-3 text-6xl font-black leading-none text-as-red/[0.06] transition-colors duration-300 group-hover:text-as-red/15">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-as-red/10 text-as-red transition-all duration-300 group-hover:scale-110 group-hover:bg-as-red group-hover:text-white">
        <Icon name={icon} className="h-7 w-7" />
      </div>
      <h3 className="relative mt-6 text-lg font-bold text-as-charcoal transition-colors group-hover:text-as-red">
        {title}
      </h3>
      <p className="relative mt-2.5 flex-1 text-sm leading-relaxed text-as-charcoal/60">{summary}</p>
      <span className="relative mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-as-red">
        Explore
        <Icon
          name="arrow"
          className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
        />
      </span>
      <span className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-as-red to-as-red-light transition-transform duration-500 ease-out group-hover:scale-x-100" />
    </Link>
  )

  if (reduce) return <div className="h-full">{inner}</div>

  return (
    <div style={{ perspective: 1000 }} className="h-full">
      <motion.div
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        whileHover={{ translateZ: 0 }}
        className="h-full transition-transform duration-200 hover:-translate-y-1.5"
      >
        {inner}
      </motion.div>
    </div>
  )
}

export default function WhatWeDo() {
  const { whatWeDo, solutions, contact } = useContent()
  const container = useScrollEl()
  const reduce = useReducedMotion()
  const list = (solutions || []).filter((s) => s.visible !== false)

  const intro = whatWeDo.intro || []
  const heroLead = intro[0] || ''
  const aboutParas = intro.length > 1 ? intro.slice(1) : intro
  const keywords = ['Technology', 'Security', 'Automation', 'Business Solutions']

  const { scrollYProgress } = useScroll({ container })
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 })

  const heroRef = useRef(null)
  const { scrollYProgress: heroP } = useScroll({
    target: heroRef,
    container,
    offset: ['start start', 'end start'],
  })
  const heroY = useTransform(heroP, [0, 1], [0, 140])
  const heroOpacity = useTransform(heroP, [0, 0.7], [1, 0])

  return (
    <div className="relative bg-white">
      {/* Reading progress line — sticks to the top of the scroll area. */}
      <motion.div
        aria-hidden
        style={{ scaleX: progress }}
        className="sticky left-0 top-0 z-30 -mb-0.5 h-0.5 w-full origin-left bg-gradient-to-r from-as-red to-as-red-light"
      />

      {/* ================= HERO ================= */}
      <section
        ref={heroRef}
        className="relative flex min-h-[90vh] items-center overflow-hidden bg-[#0b0c0e] text-white"
      >
        {/* Background banner. It is a bright image and the hero copy on top is
            white, so it carries a scrim — flat fill for overall readability,
            plus a vertical gradient that anchors the top and bottom edges where
            the heading and the scroll cue sit. */}
        <div aria-hidden className="absolute inset-0">
          <img
            src="/whyAS.webp"
            alt=""
            fetchpriority="high"
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-[#0b0c0e]/70" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b0c0e]/80 via-transparent to-[#0b0c0e]/90" />
        </div>

        <Aurora />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent)',
          }}
        />

        <motion.div
          style={reduce ? undefined : { y: heroY, opacity: heroOpacity }}
          className="relative mx-auto w-full max-w-5xl px-5 py-24 text-center sm:px-8"
        >
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-as-red-light opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-as-red-light" />
            </span>
            {whatWeDo.eyebrow}
          </motion.p>

          <h1 className="mt-8 text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl lg:text-8xl">
            <WordReveal text={whatWeDo.title} />
          </h1>

          {heroLead && (
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut', delay: 0.5 }}
              className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg"
            >
              {heroLead}
            </motion.p>
          )}
        </motion.div>

        {/* Scroll cue */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="flex h-10 w-6 items-start justify-center rounded-full border border-white/25 p-1.5">
            <motion.span
              animate={reduce ? undefined : { y: [0, 10, 0], opacity: [1, 0.2, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              className="h-2 w-1 rounded-full bg-white/70"
            />
          </div>
        </motion.div>
      </section>

      {/* ================= MOVING KEYWORD RIBBON =================
          Two identical tracks; the marquee keyframe shifts by -50%, so the
          second track lands exactly where the first was → seamless loop. */}
      <div className="overflow-hidden border-y border-as-red/10 bg-as-red/[0.04] py-5">
        <div className="flex w-max animate-marquee whitespace-nowrap">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex items-center gap-6 pr-6" aria-hidden={copy === 1}>
              {Array.from({ length: 4 }).flatMap((_, dup) =>
                keywords.map((k, i) => (
                  <span key={`${dup}-${i}`} className="flex items-center gap-6">
                    <span className="text-lg font-extrabold uppercase tracking-tight text-as-charcoal sm:text-2xl">
                      {k}
                    </span>
                    <Icon name="arrow" className="h-5 w-5 shrink-0 text-as-red" />
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ================= ABOUT ================= */}
      <section className="border-b border-black/5 py-24 sm:py-32">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24">
              <Reveal>
                <span className="text-sm font-semibold uppercase tracking-[0.2em] text-as-red">
                  The division
                </span>
                <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-as-charcoal sm:text-4xl">
                  Who we are
                </h2>
                <span className="mt-6 block h-1 w-16 rounded-full bg-gradient-to-r from-as-red to-as-red-light" />
              </Reveal>
            </div>
          </div>
          <div className="lg:col-span-8">
            <div className="space-y-6">
              {aboutParas.map((p, i) => (
                <Reveal key={i} delay={i * 90}>
                  <p
                    className={
                      i === 0
                        ? 'text-xl font-medium leading-relaxed text-as-charcoal sm:text-2xl'
                        : 'text-base leading-relaxed text-as-charcoal/60 sm:text-lg'
                    }
                  >
                    {p}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= SOLUTIONS ================= */}
      <section className="relative overflow-hidden bg-gradient-to-b from-as-red/[0.04] to-white py-24 sm:py-32">
        <div className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-as-red/[0.05] blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <span className="text-sm font-semibold uppercase tracking-[0.2em] text-as-red">
                What we deliver
              </span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-as-charcoal sm:text-4xl lg:text-5xl">
                {whatWeDo.solutionsHeading}
              </h2>
            </Reveal>
            {whatWeDo.solutionsIntro && (
              <Reveal delay={100}>
                <p className="mt-5 text-base leading-relaxed text-as-charcoal/60">
                  {whatWeDo.solutionsIntro}
                </p>
              </Reveal>
            )}
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((s, i) => (
              <Reveal key={s.slug} delay={(i % 3) * 90} y={40}>
                <TiltCard
                  to={`/what-we-do/${s.slug}`}
                  index={i}
                  icon={s.icon}
                  title={s.title}
                  summary={s.summary}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= VISION & MISSION ================= */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
            <Parallax from={40} to={-20}>
              <div className="relative h-full overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-as-red via-as-red to-as-red-dark p-9 text-white shadow-xl shadow-as-red/20 sm:p-12">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 animate-gradient-pan opacity-40"
                  style={{
                    backgroundImage:
                      'linear-gradient(120deg, rgba(255,255,255,0.25), transparent 35%, transparent 65%, rgba(255,255,255,0.18))',
                    backgroundSize: '200% 200%',
                  }}
                />
                <span className="relative inline-flex items-center rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white">
                  {whatWeDo.visionHeading}
                </span>
                <p className="relative mt-6 text-lg leading-relaxed text-white/95 sm:text-xl">
                  {whatWeDo.vision}
                </p>
              </div>
            </Parallax>
            <Parallax from={-20} to={40}>
              <div className="relative h-full overflow-hidden rounded-[1.75rem] border border-black/[0.06] bg-white p-9 shadow-xl shadow-black/5 sm:p-12">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-as-red/[0.08] blur-3xl" />
                <span className="relative inline-flex items-center rounded-full border border-as-red/20 bg-as-red/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-as-red">
                  {whatWeDo.missionHeading}
                </span>
                <p className="relative mt-6 text-lg leading-relaxed text-as-charcoal/75 sm:text-xl">
                  {whatWeDo.mission}
                </p>
              </div>
            </Parallax>
          </div>
        </div>
      </section>

      {/* ================= DIVISIONS ================= */}
      {whatWeDo.divisions?.length > 0 && (
        <section className="relative overflow-hidden bg-gradient-to-b from-white to-as-red/[0.04] py-24 sm:py-32">
          <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <Reveal>
                <span className="text-sm font-semibold uppercase tracking-[0.2em] text-as-red">
                  The group
                </span>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-as-charcoal sm:text-4xl">
                  {whatWeDo.divisionsHeading}
                </h2>
              </Reveal>
              {whatWeDo.divisionsIntro && (
                <Reveal delay={100}>
                  <p className="mt-4 text-base text-as-charcoal/60">{whatWeDo.divisionsIntro}</p>
                </Reveal>
              )}
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2">
              {whatWeDo.divisions.map((d, i) => (
                <Reveal key={i} delay={i * 100} y={36}>
                  <div className="group relative h-full overflow-hidden rounded-3xl border border-black/[0.06] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-as-red/10">
                    <span className="absolute left-0 top-0 h-full w-1 origin-top scale-y-0 bg-gradient-to-b from-as-red to-as-red-light transition-transform duration-500 ease-out group-hover:scale-y-100" />
                    <h3 className="text-xl font-bold text-as-red">{d.name}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-as-charcoal/70 sm:text-base">
                      {d.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================= CTA ================= */}
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#0b0c0e] px-6 py-16 text-center shadow-2xl sm:px-12 sm:py-20">
          <Aurora />
          <Parallax from={30} to={-30} className="relative">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Let&rsquo;s build your next solution.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/70 sm:text-lg">
              Talk to our team about how Absolute Solution can support your business.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={contact.whatsapp}
                target="_blank"
                rel="noreferrer"
                className="w-full rounded-full bg-as-red px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-as-red/30 transition hover:bg-as-red-light hover:shadow-xl sm:w-auto"
              >
                Get in touch
              </a>
              <Link
                to="/"
                className="w-full rounded-full border border-white/20 bg-white/[0.06] px-8 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10 sm:w-auto"
              >
                ← Back to home
              </Link>
            </div>
          </Parallax>
        </div>
      </section>
    </div>
  )
}
