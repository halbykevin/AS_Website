import { useEffect, useRef, useState } from 'react'

// Admin-managed hero banner carousel (like a box-office site): the slides
// auto-advance, the image and the "Buy tickets" button both open the link
// the admin set for that banner.

const INTERVAL = 5000

export default function BannerSlider({ banners }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [boxHeight, setBoxHeight] = useState(null)
  const timer = useRef(null)
  const startX = useRef(0)
  const moved = useRef(false)
  const slideRefs = useRef([])

  const count = banners.length
  const go = (i) => setIndex(((i % count) + count) % count)

  useEffect(() => {
    if (paused || dragging || count < 2) return
    timer.current = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL)
    return () => clearInterval(timer.current)
  }, [paused, dragging, count])

  // Banners can have different aspect ratios. Size the viewport to whichever
  // slide is showing so the full image fits with no crop and no empty bars.
  const syncHeight = () => {
    const el = slideRefs.current[index]
    if (el) setBoxHeight(el.offsetHeight)
  }
  useEffect(() => {
    syncHeight()
    window.addEventListener('resize', syncHeight)
    return () => window.removeEventListener('resize', syncHeight)
  }, [index, count])

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
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slides — centered container; height follows the active slide */}
      <div
        className="relative mx-auto max-w-7xl overflow-hidden bg-as-charcoal transition-[height] duration-500 ease-out"
        style={{ height: boxHeight ? `${boxHeight}px` : undefined }}
      >
        <div
          className={`flex cursor-grab touch-pan-y select-none items-start active:cursor-grabbing ${
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
          {banners.map((b, i) => (
            <SlideLink key={b.id} banner={b}>
              <img
                ref={(el) => (slideRefs.current[i] = el)}
                src={b.image}
                alt={b.title || 'Banner'}
                className="block h-auto w-full select-none object-cover"
                onLoad={syncHeight}
                draggable={false}
              />
            </SlideLink>
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
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
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

      {/* Info bar for the current slide */}
      <div className="border-b border-black/5 bg-as-charcoal/[0.03]">
        <div className="mx-auto max-w-7xl px-5 py-5 text-center sm:px-8">
          <div key={current.id} className="animate-fade-in">
            {current.title && (
              <h2 className="text-xl font-extrabold tracking-tight text-as-charcoal sm:text-2xl">
                {current.title}
              </h2>
            )}
            {current.subtitle && (
              <p className="mt-1 text-sm text-as-charcoal/60">{current.subtitle}</p>
            )}
            {current.link && (
              <a
                href={current.link}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center rounded-full bg-as-red px-7 py-2.5 text-xs font-semibold uppercase tracking-widest text-white shadow-sm transition hover:bg-as-red-light hover:shadow-md"
              >
                Buy tickets
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// The whole slide is clickable when the banner has a link.
function SlideLink({ banner, children }) {
  if (!banner.link) return <div className="w-full shrink-0">{children}</div>
  return (
    <a
      href={banner.link}
      target="_blank"
      rel="noreferrer"
      className="block w-full shrink-0"
      aria-label={banner.title || 'Open event'}
    >
      {children}
    </a>
  )
}

function Arrow({ dir, onClick }) {
  const prev = dir === 'prev'
  return (
    <button
      type="button"
      aria-label={prev ? 'Previous slide' : 'Next slide'}
      onClick={onClick}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2.5 text-white backdrop-blur transition hover:bg-as-red ${
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
