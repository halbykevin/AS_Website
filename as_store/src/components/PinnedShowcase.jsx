'use client'

import { useEffect, useRef, useState } from 'react'
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

  // On phones the panel is portrait while the photo is landscape: the image
  // renders object-contain (whole photo visible on the black bg) and the zoom
  // stops at 1 so it never crops. sm+ keeps the full cover + overshoot zoom.
  const [desktop, setDesktop] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const update = () => setDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const scale = useTransform(scrollYProgress, [0, 0.6], desktop ? [0.78, 1.12] : [0.88, 1])
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
        {/* On phones the panel is shorter and pushed below the copy so the
            heading never overlaps the photo; sm+ keeps the tall centered panel. */}
        <motion.div
          style={{ scale, borderRadius: radius }}
          className="relative mt-[16vh] h-[38vh] w-[92vw] max-w-[1200px] overflow-hidden sm:mt-0 sm:h-[78vh]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {imageUrl && (
            <img
              src={imageUrl}
              alt={eyebrow || heading || ''}
              className="h-full w-full object-contain sm:object-cover"
            />
          )}
          {/* Contrast gradient for the overlaid copy — desktop only; on mobile
              the copy sits above the panel and the photo shows clean. */}
          <div className="absolute inset-0 hidden bg-gradient-to-t from-black/70 via-black/10 to-black/30 sm:block" />
        </motion.div>

        <motion.div
          style={{ opacity: textOpacity, y: textY }}
          className="absolute inset-x-0 top-[max(12vh,96px)] px-6 text-center sm:top-[12vh]"
        >
          {heading && (
            <h2 className="text-3xl font-semibold tracking-apple text-white sm:text-5xl lg:text-7xl">
              {heading}
            </h2>
          )}
          {subheading && <p className="mt-2 text-lg text-white/70 sm:mt-3 sm:text-2xl">{subheading}</p>}
          {buttons.length > 0 && (
            <div className="mt-4 flex items-center justify-center gap-6 sm:mt-5">
              {buttons.map((b, i) => (
                <a
                  key={i}
                  href={b.href || '#'}
                  className={`text-[15px] font-medium hover:underline sm:text-[17px] ${i === 0 ? 'text-as-red-light' : 'text-white/90'}`}
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
