'use client'

import Link from 'next/link'
import Icon from '@/components/Icon.jsx'
import ProductTile from '@/components/ProductTile.jsx'
import Reveal from '@/components/Reveal.jsx'

// "New in." — the latest arrivals in a staggered reveal grid on white, a
// breather between the dark acts.
export default function FreshDrops({ products = [] }) {
  if (!products.length) return null
  return (
    <section className="bg-white py-24 sm:py-32">
      <div className="shell-wide">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-as-red">
              Just landed
            </p>
            <h2 className="mt-2 text-4xl font-bold tracking-apple text-as-ink sm:text-6xl">
              New in.
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <Link
              href="/shop?sort=newest"
              className="inline-flex items-center gap-1.5 text-base font-medium text-as-ink/60 transition hover:text-as-red"
            >
              See all new arrivals <Icon name="chevronRight" className="h-4 w-4 text-as-red" />
            </Link>
          </Reveal>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
          {products.map((p, i) => (
            <Reveal key={p.id} delay={(i % 4) * 0.08} className="[&>div]:h-full">
              <ProductTile product={p} fluid />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
