'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

// Closing act: a red stage where the closing statement scales up as you
// scroll into it, over a slow hollow marquee of the store name.
export default function FinaleCta() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] })
  const scale = useTransform(scrollYProgress, [0, 1], [0.7, 1])
  const opacity = useTransform(scrollYProgress, [0, 0.5], [0, 1])

  return (
    <section ref={ref} className="relative h-[140vh] bg-as-red">
      <div className="sticky top-0 flex h-[100svh] flex-col items-center justify-center overflow-hidden">
        {/* Slow hollow marquee behind the statement */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 select-none opacity-60">
          <div className="flex w-max animate-marquee whitespace-nowrap text-[20vw] font-black leading-none [animation-duration:50s]">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="text-stroke-white pr-16">
                AS STORE
              </span>
            ))}
          </div>
        </div>

        <motion.div style={{ scale, opacity }} className="relative px-6 text-center">
          <h2 className="text-5xl font-black leading-[1.02] tracking-apple text-white sm:text-8xl">
            Everything tech.
            <br />
            One store.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-lg text-white/75">
            Genuine products, delivered anywhere in Lebanon. Pay cash when it arrives.
          </p>
          <Link
            href="/shop"
            className="mt-9 inline-flex items-center justify-center rounded-full bg-white px-10 py-4 text-lg font-semibold text-as-red transition hover:scale-105 active:scale-95"
          >
            Start shopping
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
