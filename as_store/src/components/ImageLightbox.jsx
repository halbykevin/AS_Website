'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Icon from './Icon.jsx'

// Fullscreen product-image viewer: swipe (touch or mouse drag) between images,
// arrow buttons + arrow keys on desktop, Escape / backdrop click to close.
export default function ImageLightbox({ open, images = [], initialIndex = 0, alt = '', onClose }) {
  const pics = images.filter(Boolean)
  const [index, setIndex] = useState(initialIndex)
  const [dir, setDir] = useState(0) // -1 back, 1 forward — drives the slide animation

  // Re-anchor when (re)opened; keep the index valid if the gallery grows/shrinks.
  useEffect(() => {
    if (open) setIndex(Math.min(initialIndex, Math.max(0, pics.length - 1)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialIndex, pics.length])

  const step = useCallback(
    (d) => {
      if (pics.length < 2) return
      setDir(d)
      setIndex((i) => (i + d + pics.length) % pics.length)
    },
    [pics.length],
  )

  // Keyboard + body scroll lock while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, step, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Close"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>

          {pics.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  step(-1)
                }}
                className="absolute left-3 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:flex"
                aria-label="Previous image"
              >
                <Icon name="chevronLeft" className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  step(1)
                }}
                className="absolute right-3 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:flex"
                aria-label="Next image"
              >
                <Icon name="chevronRight" className="h-6 w-6" />
              </button>
            </>
          )}

          <div
            className="flex h-full w-full items-center justify-center overflow-hidden p-6 sm:p-14"
            onClick={(e) => e.stopPropagation()}
          >
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.img
                key={index}
                src={pics[index]}
                alt={alt}
                custom={dir}
                initial={{ x: dir * 80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -dir * 80, opacity: 0 }}
                transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
                drag={pics.length > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.6}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -60 || info.velocity.x < -400) step(1)
                  else if (info.offset.x > 60 || info.velocity.x > 400) step(-1)
                }}
                className="max-h-full max-w-full cursor-grab select-none object-contain active:cursor-grabbing"
                draggable={false}
              />
            </AnimatePresence>
          </div>

          {pics.length > 1 && (
            <div
              className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              {pics.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setDir(i > index ? 1 : -1)
                    setIndex(i)
                  }}
                  className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-2 bg-white/40 hover:bg-white/60'}`}
                  aria-label={`Image ${i + 1}`}
                />
              ))}
              <span className="ml-2 text-xs font-medium text-white/60">
                {index + 1} / {pics.length}
              </span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
