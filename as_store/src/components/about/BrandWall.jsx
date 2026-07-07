'use client'

import { useState } from 'react'
import { logoUrl } from '@/lib/brandLogos'

// One brand tile: prefers an admin-uploaded logo (brand.imageUrl), else the
// Simple Icons logo, falling back to a styled name chip if the image fails to
// load (wrong-guess slug or CDN miss).
function BrandTile({ brand }) {
  const [failed, setFailed] = useState(false)
  const src = brand.imageUrl || (brand.logo ? logoUrl(brand.logo) : '')
  return (
    <div className="flex h-16 min-w-[132px] items-center justify-center rounded-2xl border border-as-ink/10 bg-white px-6 shadow-sm">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={brand.name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-7 w-auto max-w-[104px] object-contain"
        />
      ) : (
        <span className="whitespace-nowrap text-sm font-semibold tracking-apple text-as-ink/70">
          {brand.name}
        </span>
      )}
    </div>
  )
}

// Two opposing marquee rows of brand logos (pause on hover) + a wrapped cloud of
// every brand name below. `logoBrands` = brands we have a logo slug for;
// `names` = all brand names; `total` = full brand count for the caption.
export default function BrandWall({ logoBrands = [], names = [], total = 0 }) {
  // Split the logo brands across two rows travelling opposite directions.
  const mid = Math.ceil(logoBrands.length / 2)
  const rowA = logoBrands.slice(0, mid)
  const rowB = logoBrands.slice(mid)

  const Row = ({ items, reverse }) =>
    items.length > 0 ? (
      <div className="group relative flex overflow-hidden">
        <div
          className={`flex w-max gap-4 pr-4 ${reverse ? 'animate-marquee-reverse' : 'animate-marquee'} group-hover:[animation-play-state:paused]`}
        >
          {[...items, ...items].map((b, i) => (
            <BrandTile key={`${b.name}-${i}`} brand={b} />
          ))}
        </div>
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-as-fog to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-as-fog to-transparent" />
      </div>
    ) : null

  return (
    <div>
      <div className="space-y-4">
        <Row items={rowA} reverse={false} />
        <Row items={rowB} reverse />
      </div>

      {names.length > 0 && (
        <div className="mt-10">
          <p className="text-center text-sm font-medium uppercase tracking-[0.2em] text-as-ink/40">
            {total ? `${total}+ brands and counting` : 'The brands we carry'}
          </p>
          <div className="mx-auto mt-5 flex max-w-4xl flex-wrap justify-center gap-x-2 gap-y-2">
            {names.map((n, i) => (
              <span
                key={`${n}-${i}`}
                className="rounded-full border border-as-ink/10 bg-white px-3 py-1 text-xs font-medium text-as-ink/60"
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
