'use client'

import Link from 'next/link'
import { useDispatch } from 'react-redux'
import { addItem } from '@/store/cartSlice'
import { openCart } from '@/store/uiSlice'

// Clean Apple Store product card: name, tagline, centered image, colour dots,
// "From $X", and an Add to Bag pill (wired to Redux). `fluid` fills its parent
// (for grids); otherwise it's a fixed-width card for the horizontal rails.
export default function ProductTile({ product, fluid = false }) {
  const dispatch = useDispatch()
  const { id, name, tagline, price, image, colors = [], brand, slug } = product
  const href = slug ? `/product/${slug}` : '#'

  // Sale pricing: the API returns `price` already discounted with the base in
  // `oldPrice` (from the sales engine or a manually-set old price).
  const priceNum = Number(price) || 0
  const oldPrice = product.oldPrice ? Number(product.oldPrice) : null
  const onSale = Boolean(oldPrice) && oldPrice > priceNum
  const pct = onSale ? product.salePercent || Math.round((1 - priceNum / oldPrice) * 100) : 0

  // Card teaser: the description's first real paragraph (skip markdown headings /
  // bullets), falling back to the tagline. Shown line-clamped so it ends cleanly
  // at a line break instead of the hard 90-char mid-word cut the tagline has.
  const teaser =
    String(product.description || '')
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .find((b) => b && !b.startsWith('#') && !b.startsWith('-') && !b.startsWith('*'))
      ?.replace(/[*_`]/g, '') || tagline || ''

  const add = () => {
    dispatch(addItem({ id, title: name, image, price: Number(price) || 0, slug }))
    dispatch(openCart())
  }

  const sizing = fluid ? 'w-full' : 'w-[280px] shrink-0 snap-start sm:w-[300px]'

  return (
    <div
      className={`relative flex ${sizing} h-[360px] flex-col items-center overflow-hidden rounded-[28px] border border-as-red bg-white p-4 text-center transition-shadow duration-300 hover:shadow-[0_22px_50px_-22px_rgba(164,30,34,0.35)] sm:h-[450px] sm:p-5`}
    >
      {onSale && (
        <span className="absolute right-4 top-4 rounded-full bg-as-red px-2 py-0.5 text-xs font-bold text-white">
          −{pct}%
        </span>
      )}
      {/* Fixed-height text block, overflow-hidden so a 2-line name + teaser can
          never bleed over the image below. break-words so long scraped names
          (e.g. "SFP+,10G,Multimode") wrap instead of being clipped by the card. */}
      <div className="flex h-[92px] flex-col overflow-hidden sm:h-[124px]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-as-red sm:text-xs">{brand || 'New'}</p>
        <Link href={href} className="mt-1">
          <h3 className="line-clamp-2 break-words text-sm font-semibold leading-snug tracking-apple text-as-ink sm:text-lg">{name}</h3>
        </Link>
        {teaser && <p className="mt-1 line-clamp-1 break-words text-xs leading-snug text-as-ink/55 sm:line-clamp-2 sm:text-sm">{teaser}</p>}
      </div>

      <Link href={href} className="mt-2 flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl sm:mt-3 sm:h-44">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={name}
          loading="lazy"
          className="h-full w-full object-contain transition-transform duration-500 ease-out hover:scale-[1.04]"
        />
      </Link>

      {/* Footer pinned to the bottom so prices/buttons align across cards */}
      <div className="mt-auto flex w-full flex-col items-center pt-2 sm:pt-3">
        {colors.length > 0 && (
          <div className="mb-2 flex items-center gap-1.5">
            {colors.map((c, i) => (
              <span key={i} className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: c }} />
            ))}
          </div>
        )}
        {onSale ? (
          <p className="flex items-baseline gap-2 text-sm sm:text-base">
            <span className="font-semibold text-as-red">${priceNum.toLocaleString()}</span>
            <span className="text-xs text-as-ink/40 line-through sm:text-sm">${oldPrice.toLocaleString()}</span>
          </p>
        ) : (
          <p className="text-sm font-medium text-as-ink sm:text-base">From ${priceNum.toLocaleString()}</p>
        )}
        <button onClick={add} className="pill mt-2 w-full text-sm sm:mt-3 sm:text-base">
          Add to Bag
        </button>
      </div>
    </div>
  )
}
