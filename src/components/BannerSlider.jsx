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
    </section>
  )
}

// A single full-bleed slide: cropped image + gradient + overlaid details. The
// whole slide is the link (so the "Buy tickets" pill is a styled span, not a
// nested <a>).
function Slide({ banner }) {
  const hasLink = Boolean(banner.link)
  const Wrapper = hasLink ? 'a' : 'div'
  const wrapperProps = hasLink
    ? { href: banner.link, target: '_blank', rel: 'noreferrer', 'aria-label': banner.title || 'Open event' }
    : {}

  return (
    <Wrapper {...wrapperProps} className="group relative block h-full w-full shrink-0">
      <img
        src={banner.image}
        alt={banner.title || 'Banner'}
        className="absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition: `${banner.focalX ?? 50}% ${banner.focalY ?? 50}%` }}
        draggable={false}
      />

      {/* Detail overlay — only when there's something to show */}
      {(banner.title || banner.subtitle || hasLink) && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-5 pb-10 sm:px-8 sm:pb-12 lg:px-12 lg:pb-14">
            <div className="mx-auto max-w-7xl">
              {banner.title && (
                <h2 className="max-w-2xl text-2xl font-extrabold leading-tight tracking-tight text-white drop-shadow sm:text-4xl lg:text-5xl">
                  {banner.title}
                </h2>
              )}
              {banner.subtitle && (
                <p className="mt-2 max-w-xl text-sm text-white/85 drop-shadow sm:text-base">
                  {banner.subtitle}
                </p>
              )}
              {hasLink && (
                <span className="mt-4 inline-flex items-center rounded-full bg-as-red px-7 py-2.5 text-xs font-semibold uppercase tracking-widest text-white shadow-lg transition group-hover:bg-as-red-light sm:text-sm">
                  Buy tickets
                </span>
              )}
            </div>
          </div>
        </>
      )}
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
