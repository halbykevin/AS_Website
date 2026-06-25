'use client'

import { motion } from 'framer-motion'
import Icon from './Icon.jsx'
import { hero } from '@/lib/products'

const EASE = [0.22, 0.61, 0.36, 1]
// Staggered entrance for the stacked text lines.
const up = (delay) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease: EASE },
})

// Centered Apple hero: eyebrow, big tight headline, subhead, two chevron links,
// then a large image that gently scales in.
export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-white pt-24 text-center sm:pt-28">
      <div className="shell">
        <motion.p {...up(0)} className="text-lg font-semibold text-as-red sm:text-xl">
          {hero.eyebrow}
        </motion.p>
        <motion.h1
          {...up(0.06)}
          className="mt-2 text-5xl font-semibold tracking-apple text-as-ink sm:text-7xl"
        >
          {hero.title}
        </motion.h1>
        <motion.p {...up(0.13)} className="mx-auto mt-4 max-w-xl text-xl text-as-ink/60 sm:text-2xl">
          {hero.sub}
        </motion.p>
        <motion.div {...up(0.2)} className="mt-6 flex items-center justify-center gap-6">
          <a href="#showcase" className="link-cta">
            Learn more <Icon name="chevronRight" className="h-4 w-4" />
          </a>
          <a href="#latest" className="link-cta">
            Shop <Icon name="chevronRight" className="h-4 w-4" />
          </a>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.15, delay: 0.1, ease: EASE }}
        className="mx-auto mt-12 max-w-[1100px] px-6"
      >
        <div className="overflow-hidden rounded-[28px] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.4)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero.image} alt={hero.title} className="aspect-[16/10] w-full object-cover" />
        </div>
      </motion.div>
    </section>
  )
}
