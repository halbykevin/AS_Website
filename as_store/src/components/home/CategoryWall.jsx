'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import Icon from '@/components/Icon.jsx'

const EASE = [0.22, 0.61, 0.36, 1]

function Tile({ category, index }) {
  const ref = useRef(null)
  // The image is oversized and slides inside its frame as the tile crosses
  // the viewport — a small parallax that makes the wall feel dimensional.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['-8%', '8%'])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40, clipPath: 'inset(12% 6% 12% 6% round 32px)' }}
      whileInView={{ opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0% round 32px)' }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.9, delay: (index % 3) * 0.12, ease: EASE }}
      className={index % 3 === 1 ? 'sm:mt-12' : ''}
    >
      <Link
        href={`/category/${category.slug}`}
        className="group relative block aspect-[4/5] overflow-hidden rounded-[32px] bg-as-ink-soft"
      >
        {category.imageUrl ? (
          <motion.img
            src={category.imageUrl}
            alt={category.name}
            style={{ y }}
            className="absolute inset-0 h-[116%] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          // No tile image yet — a branded placeholder with the initial letter.
          <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-as-red-dark via-as-ink-soft to-as-ink text-[120px] font-black text-white/10">
            {category.name?.[0] || '•'}
          </span>
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

        {/* Absolute, so the label never has to share a line with it. On phones a
            2-up tile is too narrow for both, so the arrow moves to the corner;
            from sm: up it returns to its place beside the label (which reserves
            room for it with pr-20). */}
        <span className="absolute right-3 top-3 flex h-8 w-8 -rotate-45 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-all duration-500 group-hover:rotate-0 group-hover:bg-as-red sm:bottom-6 sm:right-6 sm:top-auto sm:h-11 sm:w-11">
          <Icon name="chevronRight" className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>

        <span className="absolute inset-x-0 bottom-0 block p-4 sm:p-6 sm:pr-20">
          <span className="block text-base font-semibold tracking-apple text-white sm:text-2xl">
            {category.name}
          </span>
          {category.tagline && (
            <span className="mt-1 line-clamp-1 block text-xs text-white/60 sm:text-sm">
              {category.tagline}
            </span>
          )}
        </span>
      </Link>
    </motion.div>
  )
}

// Editorial wall of category tiles on ink — offset columns, parallax imagery,
// clip-path reveals.
export default function CategoryWall({ categories = [] }) {
  if (!categories.length) return null
  return (
    <section id="categories" className="relative overflow-hidden bg-as-ink py-24 sm:py-32">
      {/* Faint hollow watermark */}
      <p
        aria-hidden
        className="text-stroke-white pointer-events-none absolute -top-6 left-0 select-none whitespace-nowrap text-[18vw] font-black leading-none opacity-60"
      >
        CATEGORIES
      </p>

      <div className="shell-wide relative">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-as-red-light">
              Find your thing
            </p>
            <h2 className="mt-2 text-4xl font-bold tracking-apple text-white sm:text-6xl">
              Shop by category.
            </h2>
          </div>
          <Link
            href="/shop"
            className="inline-flex items-center gap-1.5 text-base font-medium text-white/70 transition hover:text-white"
          >
            View everything <Icon name="chevronRight" className="h-4 w-4 text-as-red-light" />
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
          {categories.map((c, i) => (
            <Tile key={c.id} category={c} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
