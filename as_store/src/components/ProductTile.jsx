'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useDispatch } from 'react-redux'
import ShareMenu from './ShareMenu.jsx'
import { addItem } from '@/store/cartSlice'
import { openCart } from '@/store/uiSlice'
import { SITE_URL } from '@/lib/seo'
import { productImage } from '@/lib/productImage'

// Clean Apple Store product card: name, tagline, centered image, colour dots,
// "From $X", and an Add to Bag pill (wired to Redux). `fluid` fills its parent
// (for grids); otherwise it's a fixed-width card for the horizontal rails.
//
// `layout` picks the shape (see tileLayout() in lib/catalogFilters):
//   'card'  upright card — the original, used by the rails and 2+ column grids
//   'row'   horizontal — thumbnail left, text right, button full width beneath
//   'auto'  'row' on phones, 'card' from sm up
//
// All three share ONE DOM tree, so the layout is pure CSS and 'auto' can flip at
// the breakpoint without JavaScript. The children are ordered image → text →
// footer, which is the horizontal reading order; the upright card reorders them
// with `order-*`, and in the horizontal one the footer simply wraps onto its own
// full-width line under both.
export default function ProductTile({ product, fluid = false, layout = 'card' }) {
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

  // Per-element classes for each layout. Written out rather than generated: the
  // upright variants already carry their own `sm:` rules, so they can't just be
  // machine-prefixed for the 'auto' breakpoint.
  // The horizontal card puts the price INSIDE the text column, beside the photo,
  // rather than in the footer. In the footer it wraps to its own full-width line,
  // which leaves an empty block next to the thumbnail and makes the card look
  // broken. Both positions exist in the markup; each layout hides the one it
  // doesn't use, because CSS can reorder siblings but cannot move an element
  // between parents.
  const S = {
    row: {
      box: 'flex-wrap items-stretch gap-x-3.5 gap-y-2.5 rounded-2xl p-3 text-left',
      img: 'h-28 w-28 shrink-0 self-start rounded-xl',
      text: 'flex min-w-0 flex-1 flex-col',
      teaser: 'line-clamp-2',
      priceHere: 'mt-auto pt-1.5',
      priceFoot: 'hidden',
      foot: 'w-full',
      price: 'items-baseline',
    },
    card: {
      box: 'h-[360px] flex-col items-center overflow-hidden rounded-[28px] p-4 text-center sm:h-[450px] sm:p-5',
      img: 'order-2 mt-2 h-32 w-full rounded-2xl sm:mt-3 sm:h-44',
      text: 'order-1 flex h-[92px] w-full flex-col overflow-hidden sm:h-[124px]',
      teaser: 'line-clamp-1 sm:line-clamp-2',
      priceHere: 'hidden',
      priceFoot: '',
      foot: 'order-3 mt-auto flex w-full flex-col items-center pt-2 sm:pt-3',
      price: 'items-baseline justify-center',
    },
    auto: {
      box: 'flex-wrap items-stretch gap-x-3.5 gap-y-2.5 rounded-2xl p-3 text-left sm:h-[450px] sm:flex-col sm:flex-nowrap sm:items-center sm:gap-0 sm:overflow-hidden sm:rounded-[28px] sm:p-5 sm:text-center',
      img: 'h-28 w-28 shrink-0 self-start rounded-xl sm:order-2 sm:mt-3 sm:h-44 sm:w-full sm:self-auto sm:rounded-2xl',
      text: 'flex min-w-0 flex-1 flex-col sm:order-1 sm:h-[124px] sm:w-full sm:flex-none sm:overflow-hidden',
      teaser: 'line-clamp-2',
      priceHere: 'mt-auto pt-1.5 sm:hidden',
      priceFoot: 'hidden sm:block',
      foot: 'w-full sm:order-3 sm:mt-auto sm:flex sm:flex-col sm:items-center sm:pt-3',
      price: 'items-baseline sm:justify-center',
    },
  }[layout] || {}

  const Price = ({ className = '' }) => (
    <div className={className}>
      {onSale ? (
        <p className={`flex gap-2 text-sm sm:text-base ${S.price}`}>
          <span className="font-semibold text-as-red">${priceNum.toLocaleString()}</span>
          <span className="text-xs text-as-ink/40 line-through sm:text-sm">${oldPrice.toLocaleString()}</span>
        </p>
      ) : (
        <p className="text-sm font-medium text-as-ink sm:text-base">From ${priceNum.toLocaleString()}</p>
      )}
    </div>
  )

  return (
    <div
      className={`relative flex ${sizing} ${S.box} border border-as-red bg-white transition-shadow duration-300 hover:shadow-[0_22px_50px_-22px_rgba(164,30,34,0.35)]`}
    >
      {onSale && (
        <span className="absolute right-4 top-4 rounded-full bg-as-red px-2 py-0.5 text-xs font-bold text-white">
          −{pct}%
        </span>
      )}
      {/* Fixed-height text block, overflow-hidden so a 2-line name + teaser can
          never bleed over the image below. w-full is required: the card is
          items-center, so without it this block sizes to its content width (the
          whole name on one line) and overflows the card sideways — w-full pins it
          to the card width so break-words + line-clamp actually wrap the text. */}
      <Link href={href} className={`relative block overflow-hidden ${S.img}`}>
        {/* next/image resizes the (often 1000×1000) source down to the card's
            real display size and serves WebP/AVIF via the Vercel optimizer. */}
        <Image
          src={productImage(image)}
          alt={name}
          fill
          sizes={layout === 'row' ? '112px' : '(max-width: 640px) 45vw, 300px'}
          className="object-contain transition-transform duration-500 ease-out hover:scale-[1.04]"
        />
      </Link>

      {/* Fixed-height text block in the upright card, overflow-hidden so a 2-line
          name + teaser can never bleed over the image below. w-full is required
          there: the card is items-center, so without it this block sizes to its
          content width (the whole name on one line) and overflows sideways. */}
      <div className={S.text}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-as-red sm:text-xs">{brand || 'New'}</p>
        <Link href={href} className="mt-1 block">
          <h3 className="line-clamp-2 break-words text-sm font-semibold leading-snug tracking-apple text-as-ink sm:text-lg">{name}</h3>
        </Link>
        {teaser && (
          <p className={`mt-1 break-words text-xs leading-snug text-as-ink/55 sm:text-sm ${S.teaser}`}>{teaser}</p>
        )}
        {/* Horizontal layout only — mt-auto pushes it to the bottom of the column
            so it lines up with the foot of the photo instead of floating. */}
        <Price className={S.priceHere} />
      </div>

      {/* Footer pinned to the bottom so prices/buttons align across cards */}
      <div className={S.foot}>
        {colors.length > 0 && (
          <div className="mb-2 flex items-center gap-1.5">
            {colors.map((c, i) => (
              <span key={i} className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: c }} />
            ))}
          </div>
        )}
        <Price className={S.priceFoot} />
        {/* Action row: the bag pill takes the space, share sits beside it — kept
            in normal flow so it can never overlap the name/price on narrow cards. */}
        <div className="mt-2 flex w-full items-center gap-2 sm:mt-3">
          <button onClick={add} className="pill min-w-0 flex-1 px-3 text-sm sm:px-5 sm:text-base">
            Add to Bag
          </button>
          <ShareMenu
            url={slug ? `${SITE_URL}/product/${slug}` : undefined}
            title={name}
            label={`Share ${name}`}
            sizeClass="h-9 w-9 shrink-0 sm:h-11 sm:w-11"
            iconClass="h-4 w-4 sm:h-[18px] sm:w-[18px]"
          />
        </div>
      </div>
    </div>
  )
}
