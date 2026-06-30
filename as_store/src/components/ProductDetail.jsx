'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useDispatch } from 'react-redux'
import Icon from './Icon.jsx'
import ProductTabs from './ProductTabs.jsx'
import { addItem } from '@/store/cartSlice'
import { openCart } from '@/store/uiSlice'

const money = (n) => `$${Number(n || 0).toLocaleString()}`

// Product detail: image gallery, name/brand/price (with sale), colour swatches,
// quantity stepper, Add to Bag (opens the cart drawer), and description.
export default function ProductDetail({ product }) {
  const dispatch = useDispatch()
  const gallery = product.images?.length ? product.images : product.image ? [product.image] : []
  const colors = Array.isArray(product.colors) ? product.colors : []

  const [active, setActive] = useState(0)
  const [color, setColor] = useState(0)
  const [qty, setQty] = useState(1)

  const price = Number(product.price) || 0
  const oldPrice = product.oldPrice ? Number(product.oldPrice) : null
  const onSale = oldPrice && oldPrice > price

  const add = () => {
    dispatch(addItem({ id: product.id, title: product.name, image: gallery[0] || '', price, qty }))
    dispatch(openCart())
  }

  return (
    <section className="bg-white pb-20 pt-24 sm:pt-28">
      <div className="shell-wide">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Gallery */}
          <div>
            <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[28px] bg-white ring-1 ring-as-ink/10">
              {gallery[active] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={gallery[active]} alt={product.name} className="h-full w-full object-contain p-6" />
              ) : (
                <div className="aspect-[4/3] w-full" />
              )}
            </div>
            {gallery.length > 1 && (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {gallery.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className={`flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 bg-as-fog transition ${
                      i === active ? 'border-as-red' : 'border-transparent hover:border-as-ink/20'
                    }`}
                    aria-label={`View image ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-contain p-2" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="lg:pt-6">
            {product.brand && (
              <p className="text-sm font-semibold uppercase tracking-wide text-as-red">{product.brand}</p>
            )}
            <h1 className="mt-1 text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">
              {product.name}
            </h1>
            {product.tagline && <p className="mt-3 text-xl text-as-ink/60">{product.tagline}</p>}

            <div className="mt-6 flex items-center gap-3">
              <span className="text-2xl font-semibold text-as-ink">{money(price)}</span>
              {onSale && (
                <>
                  <span className="text-lg text-as-ink/40 line-through">{money(oldPrice)}</span>
                  <span className="rounded-full bg-as-red/10 px-2 py-0.5 text-xs font-semibold text-as-red">
                    Save {money(oldPrice - price)}
                  </span>
                </>
              )}
            </div>

            {colors.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-sm font-medium text-as-ink/70">Colour</p>
                <div className="flex items-center gap-2.5">
                  {colors.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => setColor(i)}
                      className={`h-8 w-8 rounded-full ring-2 ring-offset-2 transition ${
                        i === color ? 'ring-as-ink/60' : 'ring-transparent hover:ring-as-ink/20'
                      }`}
                      style={{ background: c }}
                      aria-label={`Colour ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <div className="flex items-center rounded-full border border-as-ink/15">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="flex h-11 w-11 items-center justify-center text-as-ink/60 hover:text-as-ink disabled:opacity-30"
                  disabled={qty <= 1}
                  aria-label="Decrease quantity"
                >
                  <Icon name="minus" className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-medium text-as-ink">{qty}</span>
                <button
                  onClick={() => setQty((q) => q + 1)}
                  className="flex h-11 w-11 items-center justify-center text-as-ink/60 hover:text-as-ink"
                  aria-label="Increase quantity"
                >
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              </div>
              <button onClick={add} className="pill flex-1 justify-center sm:flex-none sm:px-10">
                Add to Bag
              </button>
            </div>

            {product.categorySlug && (
              <p className="mt-5 text-sm text-as-ink/50">
                Category:{' '}
                <Link href={`/category/${product.categorySlug}`} className="text-as-red hover:underline">
                  {product.category || product.categorySlug}
                </Link>
              </p>
            )}

          </div>
        </div>

        {/* Full-width tabbed details: Description + Specifications */}
        <ProductTabs description={product.description} specs={product.specs} />
      </div>
    </section>
  )
}
