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

  const sizing = fluid ? 'w-full' : 'w-[260px] shrink-0 snap-start sm:w-[300px]'

  return (
    <div className={`flex ${sizing} flex-col items-center rounded-[28px] bg-as-fog p-6 text-center transition-shadow duration-300 hover:shadow-[0_22px_50px_-22px_rgba(0,0,0,0.3)]`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-as-red">{brand || 'New'}</p>
      <Link href={href} className="mt-2">
        <h3 className="text-xl font-semibold tracking-apple text-as-ink">{name}</h3>
      </Link>
      <p className="mt-1 text-sm text-as-ink/55">{tagline}</p>

      <Link href={href} className="mt-5 block w-full overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={name}
          loading="lazy"
          className="aspect-square w-full object-cover transition-transform duration-500 ease-out hover:scale-[1.04]"
        />
      </Link>

      {colors.length > 0 && (
        <div className="mt-4 flex items-center gap-1.5">
          {colors.map((c, i) => (
            <span
              key={i}
              className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
              style={{ background: c }}
            />
          ))}
        </div>
      )}

      <p className="mt-4 text-base font-medium text-as-ink">From ${(Number(price) || 0).toLocaleString()}</p>
      <button onClick={add} className="pill mt-3 w-full">
        Add to Bag
      </button>
    </div>
  )
}
