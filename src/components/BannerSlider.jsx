import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// Every banner sends visitors to the events listing page
// (www.as.com.lb/events in production) rather than each banner's own link.
const EVENTS_PATH = '/events'

// Admin-managed hero banner carousel, styled like a box-office site
// (ticketingboxoffice.com): full-bleed, a fixed cinematic aspect ratio with the
// image cropped to fill. It carries the image only — no caption bar — and the
// whole slide opens the events page.

const INTERVAL = 5000

// One fixed aspect ratio per breakpoint — every banner is cropped to fit, so
// the strip never changes height between slides. Taller on phones, wide and
// cinematic on larger screens.
const ASPECT = 'aspect-[16/9] sm:aspect-[16/6] lg:aspect-[16/5]'

export default function BannerSlider({ banners }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  const timer = useRef(null)
  const startX = useRef(0)
  const moved = useRef(false)

  const count = banners.length
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
      aria-label="Featured"
      className="relative w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Fixed aspect ratio, softly rounded so the strips read as separate panels */}
      <div className={`relative w-full overflow-hidden rounded-[28px] bg-as-charcoal shadow-xl shadow-black/10 sm:rounded-[36px] ${ASPECT}`}>
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
          {banners.map((b) => (
            <Slide key={b.id} banner={b} />
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
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => go(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// A single full-bleed slide: the cropped image, positioned by its focal point.
// The whole slide links to the events page. Details live in the bar below.
function Slide({ banner }) {
  return (
    <Link to={EVENTS_PATH} aria-label={banner.title || 'Browse events'} className="relative block h-full w-full shrink-0">
      <img
        src={banner.image}
        alt={banner.title || 'Banner'}
        className="absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition: `${banner.focalX ?? 50}% ${banner.focalY ?? 50}%` }}
        draggable={false}
      />
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
      className={`absolute top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-2.5 text-white backdrop-blur transition hover:bg-as-red ${
        prev ? 'left-3 sm:left-5' : 'right-3 sm:right-5'
      }`}
    >
      <svg
        className={`h-5 w-5 ${prev ? 'rotate-180' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  )
}
