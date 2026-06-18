import { useEffect, useRef, useState } from 'react'

// Admin-managed hero banner carousel, styled like a box-office site
// (ticketingboxoffice.com): full-bleed, a fixed cinematic aspect ratio with the
// image cropped to fill, and the event details (title, subtitle, "Buy tickets")
// overlaid on a gradient. The whole slide opens the link the admin set.

const INTERVAL = 5000

// One fixed aspect ratio per breakpoint — every banner is cropped to fit, so
// the strip never changes height between slides. Taller on phones, wide and
// cinematic on larger screens.
const ASPECT = 'aspect-[3/2] sm:aspect-[16/7] lg:aspect-[16/6]'

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
  const current = banners[index]

  return (
    <section
      aria-label="Featured"
      className="relative w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Full-bleed viewport with a fixed aspect ratio */}
      <div className={`relative w-full overflow-hidden bg-as-charcoal ${ASPECT}`}>
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

      {/* Details bar for the current slide (below the image, AS Company style) */}
      {(current.title || current.subtitle || current.link) && (
        <div className="border-b border-black/5 bg-white">
          <div className="mx-auto max-w-3xl px-5 py-7 text-center sm:px-8 sm:py-9">
            <div key={current.id} className="animate-fade-in">
              {current.title && (
                <h2 className="text-2xl font-extrabold uppercase tracking-tight text-as-charcoal sm:text-3xl">
                  {current.title}
                </h2>
              )}
              {current.subtitle && (
                <p className="mt-2 text-sm font-medium text-as-charcoal/55 sm:text-base">
                  {current.subtitle}
                </p>
              )}
              {current.link && (
                <a
                  href={current.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center rounded-full border-2 border-as-red px-8 py-2.5 text-xs font-semibold uppercase tracking-widest text-as-red transition hover:bg-as-red hover:text-white sm:text-sm"
                >
                  Buy tickets
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// A single full-bleed slide: the cropped image, positioned by its focal point.
// Details live in the bar below the slideshow, not over the image.
function Slide({ banner }) {
  const hasLink = Boolean(banner.link)
  const Wrapper = hasLink ? 'a' : 'div'
  const wrapperProps = hasLink
    ? { href: banner.link, target: '_blank', rel: 'noreferrer', 'aria-label': banner.title || 'Open event' }
    : {}

  return (
    <Wrapper {...wrapperProps} className="relative block h-full w-full shrink-0">
      <img
        src={banner.image}
        alt={banner.title || 'Banner'}
        className="absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition: `${banner.focalX ?? 50}% ${banner.focalY ?? 50}%` }}
        draggable={false}
      />
    </Wrapper>
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
