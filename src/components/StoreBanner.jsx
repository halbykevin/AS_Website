import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useContent } from '../store/content.jsx'
import BannerCta from './BannerCta'

// The homepage's AS Store panel: a slideshow of real products from the store,
// two or three at a time, and tapping any of them opens that product on
// store.as.com.lb.
//
// What it is NOT: a price list. The cards carry a brand, a name, a line of
// description and the photo — never a price. Prices move (sales, the catalog
// sync, "call for price" lines) and the store is the one place they are quoted;
// a figure printed here is a promise this site would then have to keep true.
//
// Where the products come from: /api/store-banner on the AS Company API, which
// reads the store's own catalog live and applies the admin's choice — a random
// sample of the catalog, or exactly the products they picked (/admin/story).
// Nothing about the products is stored on this site.
//
// It replaced the admin-uploaded image slideshow. The images were a picture OF
// the store; this is the store — what is actually in it, kept current by the
// store's own catalog rather than by remembering to upload a new banner.

const INTERVAL = 5000

// Split the products into slides of `cols` cards.
function chunk(list, cols) {
  const out = []
  for (let i = 0; i < list.length; i += cols) out.push(list.slice(i, i + cols))
  return out
}

export default function StoreBanner({ banner, height, fill = false }) {
  const { store } = useContent()
  const storeHref = store?.url || '/store'
  const products = banner?.products || []

  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  // Phones can't fit three cards side by side, so the admin's number is the
  // desktop number and narrow screens cap at two.
  const [narrow, setNarrow] = useState(false)
  const timer = useRef(null)
  const startX = useRef(0)
  const moved = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const sync = () => setNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const perSlide = Math.min(4, Math.max(1, Number(banner?.perSlide) || 3))
  const cols = narrow ? Math.min(2, perSlide) : perSlide
  const slides = chunk(products, cols)
  const count = slides.length
  const go = (i) => setIndex(((i % count) + count) % count)

  // The slide count changes with the breakpoint — clamp so a resize can't leave
  // the track parked past the last slide.
  useEffect(() => {
    setIndex((i) => (count ? Math.min(i, count - 1) : 0))
  }, [count])

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
  // A swipe shouldn't also open the card underneath it.
  const onClickCapture = (e) => {
    if (moved.current) {
      e.preventDefault()
      e.stopPropagation()
      moved.current = false
    }
  }

  // No products (store API down, or the admin's picks are all gone from the
  // catalog): fall back to the plain AS Store panel rather than a blank hole in
  // the homepage grid.
  if (!count) return <StoreLogoPanel href={storeHref} height={height} fill={fill} />

  // Stacked on a phone this panel sets its OWN height instead of the shared
  // 16:N strip the other two use: a letterbox that shallow has no room for a
  // product card. `fill` (the desktop bento cell) still stretches to its parent.

  return (
    <section
      aria-label="AS Store"
      className={`relative w-full ${fill ? 'h-full' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className={`relative w-full overflow-hidden rounded-[28px] bg-white shadow-2xl shadow-black/10 ring-1 ring-black/[0.04] transition-shadow duration-500 hover:shadow-black/20 motion-safe:animate-pulse-soft hover:[animation-play-state:paused] sm:rounded-[36px] ${
          fill ? 'h-full' : 'aspect-[4/3] min-h-[17rem] sm:aspect-[16/7]'
        }`}
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
          {slides.map((slide, i) => (
            <div
              key={i}
              // pt clears the "Visit store" pill pinned to the panel's corner.
              className="flex h-full w-full shrink-0 items-stretch gap-2.5 p-3 pt-12 sm:gap-4 sm:p-5 sm:pt-16"
            >
              {slide.map((p) => (
                <ProductCard key={p.id} product={p} storeHref={storeHref} />
              ))}
              {/* Keep the last slide's cards the same width as every other
                  slide's when the products don't divide evenly. */}
              {Array.from({ length: cols - slide.length }).map((_, k) => (
                <div key={`pad-${k}`} className="min-w-0 flex-1" aria-hidden />
              ))}
            </div>
          ))}
        </div>

        {/* Sibling of the drag container, never a child — a swipe must not fire it. */}
        <BannerCta href={storeHref} label="Visit store" />

        {count > 1 && (
          <>
            <Arrow dir="prev" onClick={() => go(index - 1)} />
            <Arrow dir="next" onClick={() => go(index + 1)} />
          </>
        )}

        {count > 1 && (
          <div className="absolute bottom-2 left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 flex-wrap items-center justify-center gap-0.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => go(i)}
                className="group/dot flex h-4 w-3 items-center justify-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${
                    i === index ? 'w-3 bg-as-charcoal' : 'w-1.5 bg-as-charcoal/25 group-hover/dot:bg-as-charcoal/50'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// One product: brand, name, teaser, photo and a red pill — the AS Store card,
// minus the price and the bag. The whole card is the link.
function ProductCard({ product, storeHref }) {
  const external = /^https?:\/\//i.test(storeHref)
  const href = external
    ? product.slug
      ? `${storeHref.replace(/\/$/, '')}/product/${product.slug}`
      : storeHref
    : storeHref
  const cls =
    'group flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-as-red bg-white p-2.5 text-center transition-shadow duration-300 hover:shadow-[0_22px_50px_-22px_rgba(164,30,34,0.35)] sm:rounded-[22px] sm:p-4'

  const inner = (
    <>
      <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-as-red sm:text-[11px]">
        {product.brand || 'AS Store'}
      </p>
      <h3 className="mt-0.5 line-clamp-2 break-words text-[11px] font-semibold leading-snug text-as-charcoal sm:text-base">
        {product.name}
      </h3>
      {product.teaser && (
        <p className="mt-0.5 line-clamp-2 hidden break-words text-xs leading-snug text-as-charcoal/50 sm:block">
          {product.teaser}
        </p>
      )}
      {/* The photo takes whatever height is left, so the card fits the panel
          instead of the panel fitting the card. */}
      <div className="mt-1.5 min-h-0 flex-1 sm:mt-3">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          draggable={false}
          className="h-full w-full select-none object-contain transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
      </div>
      <span className="mt-1.5 inline-flex w-full items-center justify-center truncate rounded-full bg-as-red px-2 py-1.5 text-[10px] font-semibold text-white transition group-hover:bg-as-red-dark sm:mt-3 sm:px-5 sm:py-2.5 sm:text-sm">
        Shop now
      </span>
    </>
  )

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link to={href} className={cls}>
      {inner}
    </Link>
  )
}

// The panel with no products in it: the AS Store logo, and nothing else — the
// same shape the events panel takes.
function StoreLogoPanel({ href, height, fill }) {
  const ratio = Number(height) > 0 ? Number(height) : 6
  const external = /^https?:\/\//i.test(href)
  const cls = `group relative flex w-full items-center justify-center overflow-hidden rounded-[28px] bg-white shadow-2xl shadow-black/10 ring-1 ring-black/[0.04] transition-shadow duration-500 hover:shadow-black/20 motion-safe:animate-pulse-soft hover:[animation-play-state:paused] sm:rounded-[36px] ${
    fill ? 'h-full' : ''
  }`
  const style = fill
    ? { animationDelay: '-2.6s' }
    : { animationDelay: '-2.6s', aspectRatio: `16 / ${ratio}` }
  const logo = (
    <img
      src="/as-store-logo.png"
      alt="AS Store"
      className="max-h-[72%] w-auto max-w-[62%] object-contain transition-transform duration-500 group-hover:scale-[1.03]"
    />
  )
  return (
    <section aria-label="AS Store" className={`relative w-full ${fill ? 'h-full' : ''}`}>
      {external ? (
        <a href={href} target="_blank" rel="noreferrer" className={cls} style={style}>
          {logo}
        </a>
      ) : (
        <Link to={href} className={cls} style={style}>
          {logo}
        </Link>
      )}
    </section>
  )
}

function Arrow({ dir, onClick }) {
  const prev = dir === 'prev'
  return (
    <button
      type="button"
      aria-label={prev ? 'Previous slide' : 'Next slide'}
      onClick={onClick}
      className={`absolute top-1/2 z-20 -translate-y-1/2 p-1.5 text-as-charcoal/25 transition-opacity duration-300 hover:text-as-charcoal/80 sm:p-2 ${
        prev ? 'left-0.5 sm:left-2' : 'right-0.5 sm:right-2'
      }`}
    >
      <svg
        className={`h-5 w-5 sm:h-7 sm:w-7 ${prev ? 'rotate-180' : ''}`}
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
