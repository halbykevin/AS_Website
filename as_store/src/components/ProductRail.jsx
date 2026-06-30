'use client'

import { useRef } from 'react'
import Icon from './Icon.jsx'
import ProductTile from './ProductTile.jsx'
import { useProducts } from '@/lib/queries'

// Horizontal product rail (Apple Store "The latest." carousel), CMS-driven:
// heading/subheading, which category to pull, an optional limit and background.
// Data comes from React Query; arrows smooth-scroll the snap track.
export default function ProductRail({ section = {} }) {
  const { heading, subheading, bg } = section
  const category = section.settings?.category || 'All'
  const limit = Number(section.settings?.limit) || 0
  const anchor = section.settings?.anchor || undefined
  const onDark = section.textTheme === 'dark'

  const { data, isLoading } = useProducts(category, limit)
  const railRef = useRef(null)

  const scrollBy = (dir) => {
    const el = railRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <section id={anchor} className="py-12 sm:py-16" style={{ backgroundColor: bg || '#ffffff' }}>
      <div className="shell-wide">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            {heading && (
              <h2 className={`text-3xl font-semibold tracking-apple sm:text-4xl ${onDark ? 'text-white' : 'text-as-ink'}`}>
                {heading}
              </h2>
            )}
            {subheading && (
              <p className={`mt-1 text-lg ${onDark ? 'text-white/60' : 'text-as-ink/55'}`}>{subheading}</p>
            )}
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <button
              onClick={() => scrollBy(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-as-fog text-as-ink transition hover:bg-as-ink/10"
              aria-label="Scroll left"
            >
              <Icon name="chevronLeft" className="h-5 w-5" />
            </button>
            <button
              onClick={() => scrollBy(1)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-as-fog text-as-ink transition hover:bg-as-ink/10"
              aria-label="Scroll right"
            >
              <Icon name="chevronRight" className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div ref={railRef} className="no-scrollbar flex snap-x gap-5 overflow-x-auto pb-3">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[430px] w-[280px] shrink-0 animate-pulse rounded-[28px] bg-as-fog sm:w-[300px]"
                />
              ))
            : (data ?? []).map((p) => <ProductTile key={p.id} product={p} />)}
        </div>
      </div>
    </section>
  )
}
