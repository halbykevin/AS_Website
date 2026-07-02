import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// Every story slide sends visitors to the AS Store "coming soon" page.
const STORE_PATH = '/store'

// Homepage image slideshow — the same simple, image-only carousel as the events
// BannerSlider, but every slide opens the AS Store coming-soon page. Panels are
// admin-managed images (uploaded in /admin/story); no captions, headings or
// animations — just the picture cropped to fill.

const INTERVAL = 5000

// One fixed aspect ratio per breakpoint — every image is cropped to fit, so the
// strip never changes height between slides. Matches the events BannerSlider.
const ASPECT = 'aspect-[16/9] sm:aspect-[16/6] lg:aspect-[16/5]'

export default function HorizontalStory({ story }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  const timer = useRef(null)
  const startX = useRef(0)
  const moved = useRef(false)

  const panels = story?.panels || []
  const count = panels.length
  const go = (i) => setIndex(((i % count) + count) % count)

  useEffect(() => {
    if (paused || dragging || count < 2) return
    timer.current = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL)
    return () => clearInterval(timer.current)
  }, [paused, dragging, count])

  // ---- Touch / mouse drag to slide (works on both mobile and desktop) ----
  const dragStart = (clientX) => {
    startX.current = clientX
    moved.current = false
    setDragging(true)
  }
  const dragMove = (clientX) => {
    const dx = clientX - startX.current
    if (Math.abs(dx) > 8) moved.current = true
    setDrag(dx)
  }
  const dragEnd = () => {
    setDragging(false)
    if (Math.abs(drag) > 50) go(drag < 0 ? index + 1 : index - 1)
    setDrag(0)
  }

  const onTouchStart = (e) => dragStart(e.touches[0].clientX)
  const onTouchMove = (e) => {
    if (!dragging) return
    dragMove(e.touches[0].clientX)
  }

  // Desktop: click-and-drag to swipe between slides.
  const onMouseDown = (e) => {
    e.preventDefault() // stop native image/link ghost-drag
    dragStart(e.clientX)
  }
  const onMouseMove = (e) => {
    if (!dragging) return
    dragMove(e.clientX)
  }
  // A swipe shouldn't also trigger the slide's link.
  const onClickCapture = (e) => {
    if (moved.current) {
      e.preventDefault()
      e.stopPropagation()
      moved.current = false
    }
  }

  if (!count) return null

  return (
    <section
      aria-label="AS Store"
      className="relative w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Fixed aspect ratio, softly rounded so the strips read as separate panels */}
      <div
        className={`relative w-full overflow-hidden rounded-[28px] bg-as-charcoal shadow-2xl shadow-black/10 transition-shadow duration-500 hover:shadow-black/20 motion-safe:animate-pulse-soft hover:[animation-play-state:paused] sm:rounded-[36px] ${ASPECT}`}
        style={{ animationDelay: '-2.6s' }}
      >
        <div
          className={`flex h-full cursor-grab touch-pan-y select-none active:cursor-grabbing ${
            dragging ? '' : 'transition-transform duration-700 ease-out'
          }`}
          style={{ transform: `translateX(calc(-${index * 100}% + ${drag}px))` }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={dragEnd}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={dragEnd}
          onMouseLeave={() => dragging && dragEnd()}
          onClickCapture={onClickCapture}
        >
          {panels.map((p, i) => (
            <Slide key={p.id ?? i} panel={p} />
          ))}
        </div>

        {/* Arrows over the image */}
        {count > 1 && (
          <>
            <Arrow dir="prev" onClick={() => go(index - 1)} />
            <Arrow dir="next" onClick={() => go(index + 1)} />
          </>
        )}

        {/* Dots */}
        {count > 1 && (
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
            {panels.map((p, i) => (
              <button
                key={p.id ?? i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// A single full-bleed slide: the cropped image. The whole slide opens the AS
// Store coming-soon page.
function Slide({ panel }) {
  return (
    <Link to={STORE_PATH} aria-label="AS Store — coming soon" className="relative block h-full w-full shrink-0">
      {panel.image ? (
        <img
          src={panel.image}
          alt=""
          className="absolute inset-0 h-full w-full select-none object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-as-charcoal" />
      )}
    </Link>
  )
}

function Arrow({ dir, onClick }) {
  const prev = dir === 'prev'
  return (
    <button
      type="button"
      aria-label={prev ? 'Previous slide' : 'Next slide'}
      onClick={onClick}
      className={`absolute top-1/2 z-20 -translate-y-1/2 p-2 text-white/35 transition-opacity duration-300 hover:text-white/90 ${
        prev ? 'left-2 sm:left-4' : 'right-2 sm:right-4'
      }`}
    >
      <svg
        className={`h-7 w-7 ${prev ? 'rotate-180' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  )
}
