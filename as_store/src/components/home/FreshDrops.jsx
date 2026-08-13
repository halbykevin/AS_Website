'use client'

import Link from 'next/link'
import Icon from '@/components/Icon.jsx'
import ProductTile from '@/components/ProductTile.jsx'
import Reveal from '@/components/Reveal.jsx'
import { gridClass, tileLayout } from '@/lib/catalogFilters'

// A product strip on white — the latest arrivals in a staggered reveal grid.
// Reused for both the admin-controlled homepage "New arrivals" section (heading,
// eyebrow, source + link come from settings) and the standard "New in." block.
export default function FreshDrops({
  products = [],
  eyebrow = 'Just landed',
  heading = 'New in.',
  seeAllHref = '/shop?sort=newest',
  seeAllLabel = 'See all new arrivals',
  // `first` = this is the top block on the homepage → top padding that clears
  // the fixed nav (matches the shop/category pages), no hero above it anymore.
  first = false,
}) {
  if (!products.length) return null
  return (
    <section className={`bg-white ${first ? 'pb-20 pt-20 sm:pb-24 sm:pt-32' : 'py-24 sm:py-32'}`}>
      <div className="shell-wide">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            {eyebrow && (
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-as-red">
                {eyebrow}
              </p>
            )}
            <h2 className="mt-2 text-4xl font-bold tracking-apple text-as-ink sm:text-6xl">
              {heading}
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <Link
              href={seeAllHref}
              className="inline-flex items-center gap-1.5 text-base font-medium text-as-ink/60 transition hover:text-as-red"
            >
              {seeAllLabel} <Icon name="chevronRight" className="h-4 w-4 text-as-red" />
            </Link>
          </Reveal>
        </div>

        <div className={`mt-12 grid gap-5 ${gridClass()}`}>
          {products.map((p, i) => (
            <Reveal key={p.id} delay={(i % 4) * 0.08} className="[&>div]:h-full">
              <ProductTile product={p} fluid layout={tileLayout()} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
