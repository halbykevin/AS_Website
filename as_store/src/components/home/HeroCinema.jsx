'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRef } from 'react'
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
} from 'framer-motion'

const EASE = [0.22, 0.61, 0.36, 1]

// Headline that reveals word by word from behind a mask.
function MaskedHeadline({ text }) {
  const words = String(text || '').split(' ').filter(Boolean)
  return (
    <h1 className="text-[44px] font-bold leading-[1.04] tracking-apple text-white sm:text-7xl lg:text-8xl">
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: '110%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.9, delay: 0.15 + i * 0.09, ease: EASE }}
          >
            {w}
            {i < words.length - 1 && ' '}
          </motion.span>
        </span>
      ))}
    </h1>
  )
}

// Full-screen cinematic opener: breathing red glow on near-black, a giant
// hollow backdrop word, word-mask headline (copy still edited in
// /admin/homepage's hero block), and the flagship product floating with
// mouse tilt + scroll parallax. A category marquee closes the frame.
export default function HeroCinema({ cms, product, categories = [] }) {
  const heading = cms?.heading || 'Tech that moves you.'
  const eyebrow = cms?.eyebrow || 'AS Store — Lebanon'
  const subheading = cms?.subheading || ''
  // Single call-to-action: a "Shop" button that jumps straight to the flagship
  // product shown in the hero (falls back to the CMS button link or /shop).
  const cmsHref = Array.isArray(cms?.settings?.buttons) && cms.settings.buttons[0]?.href
  const shopHref = product?.slug ? `/product/${product.slug}` : cmsHref || '/shop'

  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -90])
  const imgY = useTransform(scrollYProgress, [0, 1], [0, 130])
  const ghostY = useTransform(scrollYProgress, [0, 1], [0, 220])
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0])

  // Pointer tilt on the product (springs so it glides, not jumps).
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const rotateX = useSpring(useTransform(my, [0, 1], [9, -9]), { stiffness: 120, damping: 18 })
  const rotateY = useSpring(useTransform(mx, [0, 1], [-11, 11]), { stiffness: 120, damping: 18 })
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width)
    my.set((e.clientY - r.top) / r.height)
  }

  const marqueeCats = categories.filter((c) => c.name).slice(0, 10)

  return (
    <section
      ref={ref}
      onMouseMove={onMove}
      className="relative flex min-h-[100svh] flex-col overflow-hidden bg-[#0B0D0E] pt-24 sm:pt-28"
    >
      {/* Breathing red glows — pure CSS keyframes (compositor), not JS loops. */}
      <div className="animate-breathe pointer-events-none absolute -left-40 top-[-10%] h-[60vh] w-[60vh] rounded-full bg-as-red/25 blur-[140px]" />
      <div className="animate-breathe-slow pointer-events-none absolute -right-40 bottom-[-20%] h-[70vh] w-[70vh] rounded-full bg-as-red-dark/30 blur-[160px]" />

      {/* Giant hollow backdrop word, drifting slower than the scroll */}
      <motion.p
        aria-hidden
        style={{ y: ghostY }}
        className="text-stroke-white pointer-events-none absolute left-1/2 top-[16%] -translate-x-1/2 select-none whitespace-nowrap text-[26vw] font-black leading-none tracking-tight sm:top-[8%] sm:text-[22vw]"
      >
        STORE
      </motion.p>

      <div className="shell-wide relative z-10 grid flex-1 grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        {/* Copy */}
        <motion.div style={{ y: copyY, opacity: fade }} className="pt-6 text-center lg:text-left">
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-sm font-semibold uppercase tracking-[0.28em] text-as-red-light"
          >
            {eyebrow}
          </motion.p>
          <div className="mt-4">
            <MaskedHeadline text={heading} />
          </div>
          {subheading && (
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6, ease: EASE }}
              className="mx-auto mt-5 max-w-md text-lg text-white/60 sm:text-xl lg:mx-0"
            >
              {subheading}
            </motion.p>
          )}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.75, ease: EASE }}
            className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start"
          >
            <Link href={shopHref} className="pill px-8 py-3 text-base">
              Shop
            </Link>
          </motion.div>
        </motion.div>

        {/* Flagship product — floats + tilts, with its name/price bar below it */}
        <div className="relative flex flex-col items-center justify-center [perspective:1200px]">
          {product?.image && (
            <>
              <motion.div
                style={{ y: imgY, rotateX, rotateY, opacity: fade, willChange: 'transform' }}
                // No hidden initial state: the image is the LCP element, so it
                // must be visible in the server-rendered HTML instead of waiting
                // ~1s for JS to hydrate and fade it in.
                initial={false}
                className="relative"
              >
                {/* Static soft glow behind the image. Previously the red halo was a
                    CSS drop-shadow filter ON the floating image — Samsung/Android
                    re-rasterizes a filtered element every animation frame, which
                    made the image flash. A separate un-animated blur layer keeps
                    the look without any per-frame filter repaint. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-6 bottom-0 top-1/3 -z-10 rounded-full bg-as-red/30 blur-[70px]"
                />
                {/* Float loop is CSS (animate-float) — no per-frame JS. */}
                <div
                  className="animate-float"
                  style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}
                >
                  {/* Optimizer-resized LCP image; `priority` emits a preload
                      for the responsive (not full 1000×1000) variant. */}
                  <Image
                    src={product.image}
                    alt={product.name}
                    width={1000}
                    height={1000}
                    priority
                    sizes="(max-width: 640px) 80vw, 45vw"
                    className="h-[34vh] w-auto max-w-[80vw] object-contain sm:h-[46vh]"
                  />
                </div>
              </motion.div>

              {/* Full-width name + price bar, sitting cleanly under the image */}
              {product.slug && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 1.1, ease: EASE }}
                  className="mt-8 w-full px-4"
                >
                  <Link
                    href={`/product/${product.slug}`}
                    className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl bg-white/[0.06] px-5 py-3 text-center text-sm text-white ring-1 ring-white/10 backdrop-blur-md transition hover:bg-white/10 sm:flex-row sm:gap-3"
                  >
                    <span className="font-medium">{product.name}</span>
                    <span className="font-semibold text-as-red-light">
                      ${Number(product.price || 0).toLocaleString()}
                    </span>
                  </Link>
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Category marquee sealing the fold */}
      {marqueeCats.length > 0 && (
        <div className="relative z-10 mt-10 border-t border-white/10 py-5">
          <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
            {[...marqueeCats, ...marqueeCats].map((c, i) => (
              <Link
                key={i}
                href={`/category/${c.slug}`}
                className="flex items-center gap-10 text-sm font-medium uppercase tracking-[0.22em] text-white/40 transition hover:text-white"
              >
                {c.name}
                <span className="text-as-red">✦</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
