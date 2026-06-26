'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { showcase } from '@/lib/products'

// Apple-style pinned moment: a tall section whose inner panel sticks to the
// viewport while the flagship image scales up and its corners square off as you
// scroll. Copy fades in then out. All scroll-linked → buttery smooth.
export default function PinnedShowcase({ bg = '#000000' }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })

  const scale = useTransform(scrollYProgress, [0, 0.6], [0.78, 1.12])
  const radius = useTransform(scrollYProgress, [0, 0.6], [44, 0])
  const textOpacity = useTransform(scrollYProgress, [0, 0.12, 0.45, 0.62], [0, 1, 1, 0])
  const textY = useTransform(scrollYProgress, [0, 0.2], [40, 0])

  return (
    <section
      id="showcase"
      ref={ref}
      style={{ backgroundColor: bg }}
      className="relative my-16 h-[260vh] rounded-[40px] sm:my-24"
    >
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        <motion.div
          style={{ scale, borderRadius: radius }}
          className="relative h-[78vh] w-[92vw] max-w-[1200px] overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={showcase.image} alt={showcase.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30" />
        </motion.div>

        <motion.div
          style={{ opacity: textOpacity, y: textY }}
          className="absolute inset-x-0 top-[12vh] px-6 text-center"
        >
          <h2 className="text-5xl font-semibold tracking-apple text-white sm:text-7xl">
            {showcase.headline}
          </h2>
          <p className="mt-3 text-xl text-white/70 sm:text-2xl">{showcase.sub}</p>
          <div className="mt-5 flex items-center justify-center gap-6">
            <a href="#latest" className="text-[17px] font-medium text-as-red-light hover:underline">
              Learn more ›
            </a>
            <a href="#latest" className="text-[17px] font-medium text-white/90 hover:underline">
              Buy ›
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
