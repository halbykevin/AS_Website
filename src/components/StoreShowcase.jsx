import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import Reveal from './Reveal.jsx'

// ---------------------------------------------------------------------------
// AS Store showcase — the eye-catching product strip at the very top of the
// homepage. Image + name cards, shuffled on each load, every card links to the
// AS Store (or the "coming soon" page while the store isn't live yet).
//
// `variant` lets us trial different looks and pick the most eye-catching one:
//   'marquee' — auto-scrolling row that pauses + lifts cards on hover (default)
//   'grid'    — responsive reveal-on-scroll grid
//   'both'    — marquee on top, grid below
// ---------------------------------------------------------------------------

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function StoreShowcase({ showcase, storeUrl = '', variant = 'marquee' }) {
  const all = Array.isArray(showcase?.products) ? showcase.products.filter(Boolean) : []
  const visibleCount = showcase?.visibleCount

  // Shuffle once per mount, then take the visible slice. (Hook runs every
  // render — keep it above the early returns.)
  const products = useMemo(() => {
    const shuffled = shuffle(all)
    const n = visibleCount || shuffled.length
    return shuffled.slice(0, n)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.length, visibleCount])

  if (!showcase || showcase.enabled === false || all.length === 0) return null

  // While the store URL is empty, send visitors to the in-site "coming soon".
  const href = storeUrl || '/store'
  const external = Boolean(storeUrl)

  return (
    <section className="relative overflow-hidden border-b border-black/5 bg-gradient-to-br from-white to-as-charcoal/[0.04] py-12 sm:py-16">
      {/* brand glows */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-as-red/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-as-charcoal/5 blur-3xl" />

      <div className="relative">
        {/* Heading */}
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              {showcase.eyebrow && (
                <span className="inline-flex items-center rounded-full border border-as-red/20 bg-as-red/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-as-red">
                  {showcase.eyebrow}
                </span>
              )}
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-as-charcoal sm:text-3xl">
                {showcase.heading}
              </h2>
              {showcase.subheading && (
                <p className="mt-2 max-w-xl text-sm text-as-charcoal/60">{showcase.subheading}</p>
              )}
            </div>
            <CardLink href={href} external={external} className="hidden shrink-0 text-sm font-semibold text-as-red transition hover:text-as-red-light sm:inline-flex">
              Explore the store →
            </CardLink>
          </div>
        </div>

        {/* Animation */}
        {(variant === 'marquee' || variant === 'both') && (
          <Marquee products={products} href={href} external={external} />
        )}
        {(variant === 'grid' || variant === 'both') && (
          <div className="mx-auto mt-8 max-w-7xl px-5 sm:px-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p, i) => (
                <Reveal key={p.id ?? i} delay={i * 60}>
                  <ProductCard product={p} href={href} external={external} />
                </Reveal>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// Auto-scrolling, drag/swipe-able row. The track holds the products twice, so
// when the scroll position passes the half-way point we subtract it for a
// seamless loop. Auto-scroll runs on rAF and pauses only while the user is
// actively dragging/swiping — it resumes the moment they let go or leave.
const AUTO_SPEED = 0.6 // px per frame (~36px/s at 60fps)

function Marquee({ products, href, external }) {
  const loop = [...products, ...products]
  const scrollerRef = useRef(null)
  const pausedRef = useRef(false) // true while the pointer is down on the track
  const dragRef = useRef(null) // mouse drag state: { startX, startScroll }
  const movedRef = useRef(false) // did this gesture move? (suppresses the click)

  // rAF auto-scroll loop. Keeps a float position so fractional speeds don't
  // get lost to integer scrollLeft rounding, and wraps in both directions so
  // dragging/swiping backwards stays seamless too.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let pos = el.scrollLeft
    let raf
    const step = () => {
      const half = el.scrollWidth / 2
      if (pausedRef.current || reduce) {
        pos = el.scrollLeft // follow the user while they scroll
      } else {
        pos += AUTO_SPEED
        el.scrollLeft = pos
      }
      if (half > 0) {
        if (el.scrollLeft >= half) {
          el.scrollLeft -= half
          pos = el.scrollLeft
        } else if (el.scrollLeft < 0) {
          el.scrollLeft += half
          pos = el.scrollLeft
        }
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [products.length])

  const onPointerDown = (e) => {
    pausedRef.current = true
    movedRef.current = false
    // Touch scrolls natively; only mouse needs manual drag-to-scroll.
    if (e.pointerType !== 'touch') {
      const el = scrollerRef.current
      dragRef.current = { startX: e.clientX, startScroll: el.scrollLeft }
      el.setPointerCapture?.(e.pointerId)
    }
  }
  const onPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    if (Math.abs(dx) > 3) movedRef.current = true
    scrollerRef.current.scrollLeft = drag.startScroll - dx
  }
  const endGesture = () => {
    dragRef.current = null
    pausedRef.current = false
  }
  // Swallow the click that follows a drag so it doesn't open the store page.
  const onClickCapture = (e) => {
    if (movedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      movedRef.current = false
    }
  }

  return (
    <div className="relative mt-8 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onPointerLeave={endGesture}
        onClickCapture={onClickCapture}
        className="flex cursor-grab gap-4 overflow-x-auto px-4 select-none touch-pan-x overscroll-x-contain active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {loop.map((p, i) => (
          <div key={i} className="w-44 shrink-0 sm:w-52">
            <ProductCard
              product={p}
              href={href}
              external={external}
              aria-hidden={i >= products.length}
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// Image + name card. Empty image → branded gradient tile with the name.
// A product's own link wins; otherwise it falls back to the section target.
function ProductCard({ product, href, external, ...rest }) {
  const link = product.link || href
  const isExternal = product.link ? /^https?:\/\//i.test(product.link) : external
  return (
    <CardLink
      href={link}
      external={isExternal}
      className="group/card block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-as-red/15"
      {...rest}
    >
      <div className="relative aspect-square overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover transition duration-500 group-hover/card:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-as-charcoal/5 via-white to-as-red/5">
            <span className="px-3 text-center text-sm font-bold uppercase tracking-wide text-as-charcoal/70">
              {product.name}
            </span>
          </div>
        )}
        <span className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-as-red transition-transform duration-300 group-hover/card:scale-x-100" />
      </div>
      <div className="px-4 py-3">
        <p className="truncate text-sm font-semibold text-as-charcoal">{product.name}</p>
      </div>
    </CardLink>
  )
}

// Internal "coming soon" page → <Link>; live external store → <a target=_blank>.
function CardLink({ href, external, children, className, ...rest }) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <Link to={href} className={className} {...rest}>
      {children}
    </Link>
  )
}
