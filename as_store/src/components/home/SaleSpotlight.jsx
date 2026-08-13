'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import Icon from '@/components/Icon.jsx'
import ProductTile from '@/components/ProductTile.jsx'
import Reveal from '@/components/Reveal.jsx'

// Deals act — only mounts when the sales engine has live discounts. A giant
// hollow "SALE" drifts against the scroll over a red-washed ink stage, and the
// discounted products ride a snap rail with old-vs-new pricing baked into the
// tiles.
export default function SaleSpotlight({ products = [], maxPercent = 0 }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const ghostX = useTransform(scrollYProgress, [0, 1], ['4%', '-24%'])

  if (!products.length) return null

  return (
    <section ref={ref} className="relative overflow-hidden bg-[#150809] py-24 sm:py-32">
      {/* Red wash + drifting hollow SALE */}
      <div className="pointer-events-none absolute -top-1/3 left-1/2 h-[80vh] w-[80vh] -translate-x-1/2 rounded-full bg-as-red/30 blur-[160px]" />
      <motion.p
        aria-hidden
        style={{ x: ghostX }}
        className="text-stroke-red pointer-events-none absolute top-8 select-none whitespace-nowrap text-[24vw] font-black leading-none sm:text-[18vw]"
      >
        SALE SALE SALE
      </motion.p>

      <div className="shell-wide relative">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-as-red-light">
              Limited time
            </p>
            <h2 className="mt-2 text-4xl font-bold tracking-apple text-white sm:text-6xl">
              On sale — up to{' '}
              <span className="text-as-red-light">−{maxPercent}%</span>
            </h2>
            <p className="mt-3 max-w-md text-white/50">
              Real markdowns on real stock. Old price crossed out, no games.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <Link
              href="/shop?sale=1"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-6 py-3 text-base font-medium text-white transition hover:border-as-red hover:bg-as-red"
            >
              Shop all deals <Icon name="chevronRight" className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>

        <div className="no-scrollbar mt-12 grid grid-cols-1 gap-5 sm:-mx-10 sm:flex sm:snap-x sm:snap-mandatory sm:overflow-x-auto sm:px-10 sm:pb-2">
          {products.map((p) => (
            <div key={p.id} className="w-full sm:w-[300px] sm:shrink-0 sm:snap-start">
              <ProductTile product={p} fluid layout="auto" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
