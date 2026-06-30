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

  const add = () => {
    dispatch(addItem({ id, title: name, image, price: Number(price) || 0 }))
    dispatch(openCart())
  }

  const sizing = fluid ? 'w-full' : 'w-[280px] shrink-0 snap-start sm:w-[300px]'

  return (
    <div
      className={`flex ${sizing} h-[430px] flex-col items-center overflow-hidden rounded-[28px] bg-white p-5 text-center ring-1 ring-as-ink/5 transition-shadow duration-300 hover:shadow-[0_22px_50px_-22px_rgba(0,0,0,0.3)]`}
    >
      {/* Fixed-height text block so every card's image starts at the same place */}
      <div className="flex h-[104px] flex-col">
        <p className="text-xs font-semibold uppercase tracking-wide text-as-red">{brand || 'New'}</p>
        <Link href={href} className="mt-1.5">
          <h3 className="line-clamp-2 text-lg font-semibold leading-snug tracking-apple text-as-ink">{name}</h3>
        </Link>
        {tagline && <p className="mt-1 line-clamp-1 text-sm text-as-ink/55">{tagline}</p>}
      </div>

      <Link href={href} className="mt-3 flex h-44 w-full items-center justify-center overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={name}
          loading="lazy"
          className="h-full w-full object-contain transition-transform duration-500 ease-out hover:scale-[1.04]"
        />
      </Link>

      {/* Footer pinned to the bottom so prices/buttons align across cards */}
      <div className="mt-auto flex w-full flex-col items-center pt-3">
        {colors.length > 0 && (
          <div className="mb-2 flex items-center gap-1.5">
            {colors.map((c, i) => (
              <span key={i} className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: c }} />
            ))}
          </div>
        )}
        <p className="text-base font-medium text-as-ink">From ${(Number(price) || 0).toLocaleString()}</p>
        <button onClick={add} className="pill mt-3 w-full">
          Add to Bag
        </button>
      </div>
    </div>
  )
}
