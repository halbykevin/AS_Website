'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useDispatch } from 'react-redux'
import Icon from '@/components/Icon.jsx'
import { addItem } from '@/store/cartSlice'
import { openCart } from '@/store/uiSlice'

const money = (n) => `$${(Number(n) || 0).toLocaleString()}`

function LineupCard({ product, index }) {
  const dispatch = useDispatch()
  const { name, brand, price, oldPrice, image, slug, salePercent } = product
  const onSale = Boolean(oldPrice) && Number(oldPrice) > Number(price)
  const href = slug ? `/product/${slug}` : '#'
  const add = () => {
    dispatch(addItem({ id: product.id, title: name, image, price: Number(price) || 0 }))
    dispatch(openCart())
  }

  return (
    <div className="group relative flex h-[58vh] max-h-[560px] w-[78vw] max-w-[440px] shrink-0 flex-col overflow-hidden rounded-[32px] bg-white p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.5)] ring-1 ring-white/10 sm:p-8">
      {/* Oversized index watermark */}
      <span className="pointer-events-none absolute -right-2 -top-6 select-none text-[110px] font-black leading-none text-as-ink/[0.05]">
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-as-red">
            {brand || 'Featured'}
          </p>
          <Link href={href}>
            <h3 className="mt-1.5 line-clamp-2 text-xl font-semibold leading-snug tracking-apple text-as-ink sm:text-2xl">
              {name}
            </h3>
          </Link>
        </div>
        {onSale && (
          <span className="shrink-0 rounded-full bg-as-red px-2.5 py-1 text-xs font-bold text-white">
            −{salePercent || Math.round((1 - price / oldPrice) * 100)}%
          </span>
        )}
      </div>

      <Link href={href} className="flex min-h-0 flex-1 items-center justify-center py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={name}
          loading="lazy"
          className="max-h-full w-auto max-w-full object-contain transition-transform duration-700 ease-out group-hover:rotate-1 group-hover:scale-[1.06]"
        />
      </Link>

      <div className="flex items-end justify-between gap-3">
        <div>
          {onSale && <p className="text-sm text-as-ink/40 line-through">{money(oldPrice)}</p>}
          <p className={`text-2xl font-semibold ${onSale ? 'text-as-red' : 'text-as-ink'}`}>
            {money(price)}
          </p>
        </div>
        <button onClick={add} className="pill px-6">
          Add to Bag
        </button>
      </div>
    </div>
  )
}

// Pinned act: the section is tall, its content sticks to the viewport, and
// vertical scroll drives the card track horizontally — the classic
// scroll-cinema gallery, on near-black with a red progress line.
export default function HorizontalShowcase({ products = [] }) {
  const sectionRef = useRef(null)
  const trackRef = useRef(null)
  const [range, setRange] = useState(0)

  // How far the track must travel: its full width minus one viewport.
  useEffect(() => {
    const measure = () => {
      if (!trackRef.current) return
      setRange(Math.max(0, trackRef.current.scrollWidth - window.innerWidth))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [products.length])

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })
  const x = useTransform(scrollYProgress, [0, 1], [0, -range])

  if (!products.length) return null

  return (
    <section
      ref={sectionRef}
      className="relative bg-[#0B0D0E]"
      style={{ height: `${120 + products.length * 55}vh` }}
    >
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden pt-24 sm:pt-20">
        <div className="shell-wide mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-as-red-light">
              Handpicked
            </p>
            <h2 className="mt-2 text-4xl font-bold tracking-apple text-white sm:text-6xl">
              The lineup.
            </h2>
          </div>
          <div className="hidden h-1 flex-1 overflow-hidden rounded-full bg-white/10 sm:block">
            <motion.div style={{ scaleX: scrollYProgress }} className="h-full origin-left bg-as-red" />
          </div>
        </div>

        <motion.div ref={trackRef} style={{ x }} className="flex w-max gap-5 px-6 sm:gap-8 sm:px-10">
          {products.map((p, i) => (
            <LineupCard key={p.id} product={p} index={i} />
          ))}

          {/* Trailing card: on to the full catalog */}
          <Link
            href="/shop"
            className="group flex h-[58vh] max-h-[560px] w-[70vw] max-w-[360px] shrink-0 flex-col items-center justify-center gap-5 rounded-[32px] border border-white/15 text-white transition hover:border-as-red hover:bg-as-red/10"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-as-red transition-transform duration-500 group-hover:scale-110">
              <Icon name="chevronRight" className="h-7 w-7" />
            </span>
            <span className="text-2xl font-semibold tracking-apple">Shop everything</span>
          </Link>
        </motion.div>

        {/* Mobile progress line */}
        <div className="shell-wide mt-8 sm:hidden">
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <motion.div style={{ scaleX: scrollYProgress }} className="h-full origin-left bg-as-red" />
          </div>
        </div>
      </div>
    </section>
  )
}
