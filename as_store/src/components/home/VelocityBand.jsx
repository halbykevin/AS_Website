'use client'

import { useRef } from 'react'
import {
  motion,
  useScroll,
  useVelocity,
  useSpring,
  useTransform,
  useMotionValue,
  useAnimationFrame,
} from 'framer-motion'

// Wrap v into [min, max) so the marquee loops seamlessly.
const wrap = (min, max, v) => {
  const range = max - min
  return ((((v - min) % range) + range) % range) + min
}

// Tilted red ribbon of store promises that drifts on its own and surges/skews
// with scroll velocity — scroll fast and the type leans into it.
export default function VelocityBand({ phrases }) {
  const items = (Array.isArray(phrases) && phrases.length
    ? phrases
    : ['Free delivery across Lebanon', '12-month warranty', 'Cash on delivery', '100% genuine tech']
  ).map((s) => s.toUpperCase())

  const baseX = useMotionValue(0)
  const { scrollY } = useScroll()
  const velocity = useVelocity(scrollY)
  const smooth = useSpring(velocity, { damping: 50, stiffness: 400 })
  const boost = useTransform(smooth, [0, 1200], [0, 5], { clamp: false })
  const skewX = useSpring(useTransform(smooth, [-1200, 1200], [8, -8]), {
    damping: 40,
    stiffness: 300,
  })
  const dir = useRef(1)

  useAnimationFrame((_, delta) => {
    const b = boost.get()
    if (b < 0) dir.current = -1
    else if (b > 0) dir.current = 1
    let move = dir.current * 2.2 * (delta / 1000) // idle drift, %/s
    move += move * Math.abs(b)
    baseX.set(baseX.get() + move)
  })

  const x = useTransform(baseX, (v) => `${wrap(-25, 0, v)}%`)

  const row = items.map((t, i) => (
    <span key={i} className="flex items-center gap-6 pr-6 sm:gap-10 sm:pr-10">
      {t}
      <span aria-hidden className="text-white/50">
        ✦
      </span>
    </span>
  ))

  return (
    // overflow-hidden is load-bearing: the w-max track is thousands of px wide
    // and would otherwise blow up the mobile layout viewport (breaking the
    // fixed nav). The band bleeds past the clip with -mx so the tilt shows no
    // clipped corners; bg matches the dark acts around it.
    <section aria-label="Store promises" className="relative overflow-hidden bg-[#0B0D0E] py-8">
      <div className="-mx-4 rotate-[-2deg] bg-as-red py-4 shadow-[0_20px_60px_-20px_rgba(164,30,34,0.8)] sm:py-5">
        <motion.div
          style={{ x, skewX }}
          className="flex w-max whitespace-nowrap text-2xl font-black uppercase tracking-tight text-white sm:text-4xl"
        >
          {row}
          {row}
          {row}
          {row}
        </motion.div>
      </div>
    </section>
  )
}
