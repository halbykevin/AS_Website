'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

// Apple-style pinned moment: a tall section whose inner panel sticks to the
// viewport while the flagship image scales up and its corners square off as you
// scroll. Copy fades in then out. CMS-driven (image/heading/subheading/buttons).
export default function PinnedShowcase({ section = {} }) {
  const { eyebrow, heading, subheading, imageUrl, bg } = section
  const buttons = Array.isArray(section.settings?.buttons) ? section.settings.buttons : []
  const anchor = section.settings?.anchor || 'showcase'

  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })

  const scale = useTransform(scrollYProgress, [0, 0.6], [0.78, 1.12])
  const radius = useTransform(scrollYProgress, [0, 0.6], [44, 0])
  const textOpacity = useTransform(scrollYProgress, [0, 0.12, 0.45, 0.62], [0, 1, 1, 0])
  const textY = useTransform(scrollYProgress, [0, 0.2], [40, 0])

  return (
    <section
      id={anchor}
      ref={ref}
      style={{ backgroundColor: bg || '#000000' }}
      className="relative my-16 h-[260vh] rounded-[40px] sm:my-24"
    >
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        <motion.div
          style={{ scale, borderRadius: radius }}
          className="relative h-[78vh] w-[92vw] max-w-[1200px] overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {imageUrl && <img src={imageUrl} alt={eyebrow || heading || ''} className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30" />
        </motion.div>

        <motion.div
          style={{ opacity: textOpacity, y: textY }}
          className="absolute inset-x-0 top-[12vh] px-6 text-center"
        >
          {heading && (
            <h2 className="text-5xl font-semibold tracking-apple text-white sm:text-7xl">{heading}</h2>
          )}
          {subheading && <p className="mt-3 text-xl text-white/70 sm:text-2xl">{subheading}</p>}
          {buttons.length > 0 && (
            <div className="mt-5 flex items-center justify-center gap-6">
              {buttons.map((b, i) => (
                <a
                  key={i}
                  href={b.href || '#'}
                  className={`text-[17px] font-medium hover:underline ${i === 0 ? 'text-as-red-light' : 'text-white/90'}`}
                >
                  {b.label} ›
                </a>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  )
}
