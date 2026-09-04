'use client'

import Link from 'next/link'
import { useRef } from 'react'
import Icon from '@/components/Icon.jsx'
import ProductTile from '@/components/ProductTile.jsx'

// One homepage row: a small category title and the products themselves, on a
// horizontal rail. The rail (rather than a grid) is what lets the homepage be
// several categories deep without turning into an endless scroll — each one
// costs a single line, and the cards keep the size they were designed at.
//
// The products are passed in already loaded by the server component, so the row
// is in the HTML: no spinner, no client fetch, and Google sees the products.
// Only the scrolling is client-side.
export default function HomeRow({ title, href, seeAllLabel = 'See all', products = [] }) {
  const railRef = useRef(null)
  // Mouse drag-to-scroll state (touch uses native overflow scrolling).
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: 0 })

  if (!products.length) return null

  const scrollBy = (dir) => {
    const el = railRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const el = railRef.current
    drag.current = { down: true, startX: e.clientX, startScroll: el.scrollLeft, moved: 0 }
    // Snapping fights manual scrollLeft updates while dragging.
    el.style.scrollSnapType = 'none'
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d.down) return
    const dx = e.clientX - d.startX
    d.moved = Math.max(d.moved, Math.abs(dx))
    // Once it's clearly a drag, capture the pointer so it survives leaving the
    // rail. (Not on pointerdown — that would retarget normal button clicks.)
    if (d.moved > 6 && !railRef.current.hasPointerCapture(e.pointerId)) {
      railRef.current.setPointerCapture(e.pointerId)
    }
    railRef.current.scrollLeft = d.startScroll - dx
  }

  const endDrag = () => {
    if (!drag.current.down) return
    drag.current.down = false
    railRef.current.style.scrollSnapType = ''
  }

  // After a real drag, swallow the click so cards/buttons underneath don't fire.
  const onClickCapture = (e) => {
    if (drag.current.moved > 6) {
      e.preventDefault()
      e.stopPropagation()
    }
    drag.current.moved = 0
  }

  return (
    <section className="py-6 sm:py-8">
      <div className="shell-wide">
        <div className="mb-3 flex items-center justify-between gap-4">
          {/* Deliberately small: the products are the page, the title only says
              which shelf you are looking at. */}
          <h2 className="min-w-0 truncate text-sm font-semibold uppercase tracking-[0.14em] text-as-ink sm:text-base sm:tracking-[0.1em]">
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            {href && (
              <Link
                href={href}
                className="text-xs font-medium text-as-ink/50 transition hover:text-as-red sm:text-sm"
              >
                {seeAllLabel}
              </Link>
            )}
            <div className="hidden items-center gap-1.5 sm:flex">
              <button
                onClick={() => scrollBy(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-as-fog text-as-ink transition hover:bg-as-ink/10"
                aria-label={`Scroll ${title} left`}
              >
                <Icon name="chevronLeft" className="h-4 w-4" />
              </button>
              <button
                onClick={() => scrollBy(1)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-as-fog text-as-ink transition hover:bg-as-ink/10"
                aria-label={`Scroll ${title} right`}
              >
                <Icon name="chevronRight" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div
          ref={railRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onClickCapture={onClickCapture}
          className="no-scrollbar flex cursor-grab snap-x gap-4 overflow-x-auto px-0.5 py-1 pb-3 active:cursor-grabbing sm:gap-5"
        >
          {products.map((p) => (
            <ProductTile key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  )
}
