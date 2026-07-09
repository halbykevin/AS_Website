import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Reveal from './Reveal.jsx'
import { optimizedImage } from '../lib/api'

// ---------------------------------------------------------------------------
// AS Store showcase — the eye-catching product strip at the very top of the
// homepage. Image + name cards, shuffled on each load, every card links to the
// AS Store (or the "coming soon" page while the store isn't live yet).
//
// `variant` lets us trial different looks and pick the most eye-catching one:
//   'marquee' — shuffling card stack: a tilted deck that auto-tosses the front
//               card and lets you swipe/drag to throw it (default)
//   'grid'    — responsive reveal-on-scroll grid
//   'both'    — card stack on top, grid below
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
          <CardStack products={products} href={href} external={external} />
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

// A shuffling deck of product "cards" stacked like tilted photos. The front
// card auto-tosses away every few seconds and the next rises to the top; you
// can also drag/swipe the top card to throw it. Pauses on hover, and respects
// prefers-reduced-motion (manual swipe still works, no auto-shuffle).
const AUTO_MS = 3200 // time the front card sits before it auto-tosses
const TOSS_THRESHOLD = 90 // px you must drag before release throws the card

function CardStack({ products, href, external }) {
  const n = products.length
  // Keep the just-tossed card off the visible depths so it never animates back
  // into the stack on small catalogs.
  const visible = Math.max(1, Math.min(3, n - 1)) || 1

  const [front, setFront] = useState(0)
  const [toss, setToss] = useState(null) // 'left' | 'right' while the front card flies off
  const [drag, setDrag] = useState(0) // live horizontal drag offset (px)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const movedRef = useRef(false)
  const pausedRef = useRef(false) // hover-pause (desktop)

  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const throwCard = (dir) => {
    if (!toss) setToss(dir)
  }

  // Once the front card has flown off, advance to the next and reset.
  const onTossEnd = (e) => {
    if (!toss || e.propertyName !== 'transform') return
    setToss(null)
    setDrag(0)
    setFront((f) => (f + 1) % n)
  }

  // Auto-shuffle.
  useEffect(() => {
    if (reduce || n < 2 || toss || dragging) return
    const id = setTimeout(() => {
      if (!pausedRef.current) throwCard(Math.random() < 0.5 ? 'left' : 'right')
    }, AUTO_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front, toss, dragging, n, reduce])

  // ---- drag / swipe the top card ----
  const down = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    startX.current = e.clientX
    movedRef.current = false
    setDragging(true)
  }
  const move = (e) => {
    if (!dragging) return
    const dx = e.clientX - startX.current
    if (Math.abs(dx) > 4) movedRef.current = true
    setDrag(dx)
  }
  const up = () => {
    if (!dragging) return
    setDragging(false)
    if (Math.abs(drag) > TOSS_THRESHOLD) throwCard(drag < 0 ? 'left' : 'right')
    else setDrag(0) // didn't throw far enough — spring back
  }
  // Swallow the click that follows a drag so it doesn't open the store page.
  const onClickCapture = (e) => {
    if (movedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      movedRef.current = false
    }
  }

  // Render back-to-front so the front card paints on top.
  const slots = []
  for (let d = visible - 1; d >= 0; d--) {
    const idx = (front + d) % n
    slots.push({ idx, depth: d, product: products[idx] })
  }

  return (
    <div
      className="relative mx-auto mt-10 h-80 w-60 select-none sm:h-96 sm:w-72"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => {
        pausedRef.current = false
        if (dragging) up()
      }}
    >
      {slots.map(({ idx, depth, product }) => {
        const isFront = depth === 0
        const tilt = ((idx * 47) % 11) - 5 // stable -5..5° so the stack looks hand-placed

        let transform
        let transition = 'transform .45s cubic-bezier(.2,.7,.3,1), opacity .45s ease'
        if (isFront && toss) {
          const dir = toss === 'left' ? -1 : 1
          transform = `translateX(${dir * 130}%) rotate(${dir * 18}deg)`
        } else if (isFront && dragging) {
          transform = `translateX(${drag}px) rotate(${drag / 22}deg)`
          transition = 'none'
        } else if (isFront) {
          transform = 'translateY(0) scale(1) rotate(0deg)'
        } else {
          transform = `translateY(-${depth * 14}px) scale(${1 - depth * 0.07}) rotate(${tilt}deg)`
        }

        return (
          <div
            key={idx}
            className="absolute inset-0"
            style={{
              transform,
              transition,
              opacity: isFront && toss ? 0 : 1,
              zIndex: visible - depth,
              willChange: 'transform',
            }}
            onTransitionEnd={isFront ? onTossEnd : undefined}
            onPointerDown={isFront ? down : undefined}
            onPointerMove={isFront ? move : undefined}
            onPointerUp={isFront ? up : undefined}
            onPointerCancel={isFront ? up : undefined}
            onClickCapture={isFront ? onClickCapture : undefined}
          >
            <div
              className={`h-full ${isFront ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
              style={{ touchAction: 'pan-y' }}
            >
              <StackCard product={product} href={href} external={external} interactive={isFront} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// A single full-height stack card. Only the front card is a real link; the
// ones behind are inert visuals (not focusable / clickable).
function StackCard({ product, href, external, interactive }) {
  const link = product.link || href
  const isExternal = product.link ? /^https?:\/\//i.test(product.link) : external
  const cls =
    'flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5'
  const inner = (
    <>
      <div className="relative flex-1 overflow-hidden">
        {product.image ? (
          <img
            src={optimizedImage(product.image, { w: 768 })}
            alt={product.name}
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-as-charcoal/5 via-white to-as-red/5">
            <span className="px-4 text-center text-base font-bold uppercase tracking-wide text-as-charcoal/70">
              {product.name}
            </span>
          </div>
        )}
        <span className="absolute inset-x-0 bottom-0 h-1 bg-as-red" />
      </div>
      <div className="px-4 py-3">
        <p className="truncate text-sm font-semibold text-as-charcoal">{product.name}</p>
      </div>
    </>
  )

  if (!interactive) {
    return (
      <div className={cls} aria-hidden>
        {inner}
      </div>
    )
  }
  return external ? (
    <a href={link} target="_blank" rel="noreferrer" className={cls} draggable={false}>
      {inner}
    </a>
  ) : (
    <Link to={link} className={cls} draggable={false}>
      {inner}
    </Link>
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
            src={optimizedImage(product.image, { w: 768 })}
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
