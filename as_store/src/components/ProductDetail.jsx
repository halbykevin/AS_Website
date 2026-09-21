'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useDispatch } from 'react-redux'
import Icon from './Icon.jsx'
import ProductTabs from './ProductTabs.jsx'
import MaxQtyNote from './MaxQtyNote.jsx'
import ImageLightbox from './ImageLightbox.jsx'
import Breadcrumbs from './Breadcrumbs.jsx'
import ShareMenu from './ShareMenu.jsx'
import QtyField from './QtyField.jsx'
import { addItem, isBulk, maxQtyOf, minQtyOf, stepOf, formatQty } from '@/store/cartSlice'
import { SITE_URL } from '@/lib/seo'
import { PRODUCT_IMAGE_FALLBACK } from '@/lib/productImage'
import { openCart } from '@/store/uiSlice'
import { trackViewItem } from '@/lib/analytics'
import { useWallet, creditFor } from '@/lib/wallet'
import { isCallForPrice, useCallForPrice, enquiryUrl } from '@/lib/callForPrice'
import { vatNote } from '@/lib/orders'
import { useVat } from '@/lib/vat'

const money = (n) => `$${Number(n || 0).toLocaleString()}`

// Product detail: image gallery, name/brand/price (with sale), colour swatches,
// quantity stepper, Add to Bag (opens the cart drawer), and description.
export default function ProductDetail({ product, whatsapp, breadcrumb = [] }) {
  const dispatch = useDispatch()
  const vat = useVat()
  const gallery = product.images?.length ? product.images : product.image ? [product.image] : []
  const colors = Array.isArray(product.colors) ? product.colors : []

  // This product's own quantity bounds, not the store's — see cartSlice. A
  // product that sells in the hundreds gets a box to type into; everything else
  // keeps the stepper, where a text field over a range of 1–2 is silly.
  const minQty = minQtyOf(product)
  const maxQty = maxQtyOf(product)
  const qtyStep = stepOf(product)
  const bulk = isBulk(product)

  const [active, setActive] = useState(0)
  const [color, setColor] = useState(0)
  const [qty, setQty] = useState(minQty)
  const [maxHit, setMaxHit] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)

  const inc = () => {
    if (qty >= maxQty) {
      setMaxHit(true)
      return
    }
    setQty((q) => q + 1)
  }

  // The floor can change under the component when a different product loads
  // into the same mounted page, and a quantity of 1 on a product with a $5
  // minimum is a number the server would silently correct.
  useEffect(() => {
    setQty(minQty)
  }, [product.id, minQty])

  // Price-hidden product: the API sends no price for these, so there is nothing
  // to render and nothing to sell. The quantity stepper and Add to Bag go with
  // the price — a bag the server will refuse at checkout is worse than no
  // button — and the enquiry replaces them.
  const cfp = useCallForPrice()
  const quoteOnly = isCallForPrice(product)
  const enquireHref = quoteOnly ? enquiryUrl(product, cfp) : ''

  const price = Number(product.price) || 0
  const oldPrice = product.oldPrice ? Number(product.oldPrice) : null
  const onSale = oldPrice && oldPrice > price

  // Which products get looked at but not bought — the report that tells you
  // where the ad spend is going. Keyed on the id so it fires again when the
  // visitor moves between product pages (the component stays mounted).
  useEffect(() => {
    trackViewItem({
      id: product.id,
      name: product.name,
      price: Number(product.price) || 0,
      brand: product.brand,
      category: product.category,
    })
  }, [product.id, product.name, product.price, product.brand, product.category])

  const add = () => {
    dispatch(
      addItem({
        id: product.id,
        title: product.name,
        image: gallery[0] || '',
        price,
        qty,
        slug: product.slug,
        // The bounds and the exemption travel with the line — the bag clamps
        // against them and the checkout prices against them without going back
        // to the API for the product.
        exclusive: product.exclusive,
        minQty: product.minQty,
        maxQty: product.maxQty,
        qtyStep: product.qtyStep,
      }),
    )
    dispatch(openCart())
  }

  return (
    <section className="bg-white pb-20 pt-24 sm:pt-28">
      <div className="shell-wide">
        <Breadcrumbs items={breadcrumb} className="mb-6" />
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Gallery */}
          <div>
            <button
              type="button"
              onClick={() => gallery[active] && setViewerOpen(true)}
              className="flex aspect-[4/3] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-[28px] bg-white ring-1 ring-as-ink/10"
              aria-label="View photos fullscreen"
            >
              {gallery[active] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={gallery[active]} alt={product.name} className="h-full w-full object-contain p-6" />
              ) : (
                // No photo (the source shop only had its own logo, which the
                // importer strips) — show the AS mark, faded, not an empty box.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={PRODUCT_IMAGE_FALLBACK}
                  alt={product.name}
                  className="h-full w-full object-contain p-16 opacity-30"
                />
              )}
            </button>
            <ImageLightbox
              open={viewerOpen}
              images={gallery}
              initialIndex={active}
              alt={product.name}
              onClose={() => setViewerOpen(false)}
            />
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
            <h1 className="mt-1 break-words text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">
              {product.name}
            </h1>
            {product.tagline && <p className="mt-3 text-xl text-as-ink/60">{product.tagline}</p>}

            <div className="mt-6 flex items-center gap-3">
              {quoteOnly ? (
                <span className="text-2xl font-semibold text-as-red">{cfp.label}</span>
              ) : (
                <span className="text-2xl font-semibold text-as-ink">{money(price)}</span>
              )}
              {!quoteOnly && onSale && (
                <>
                  <span className="text-lg text-as-ink/40 line-through">{money(oldPrice)}</span>
                  <span className="rounded-full bg-as-red/10 px-2 py-0.5 text-xs font-semibold text-as-red">
                    Save {money(oldPrice - price)}
                  </span>
                </>
              )}
            </div>

            {/* The price above is the goods alone. Skipped for a quote-only
                product: there is no figure on screen to qualify — and for an
                exclusive one, where the price IS the total and no VAT is ever
                added to it. */}
            {!quoteOnly && !product.exclusive && vatNote(vat) && (
              <p className="mt-1.5 text-sm font-medium text-as-red">{vatNote(vat)}</p>
            )}

            {/* No price, no wallet estimate — there is no figure to earn on.
                An exclusive item is outside the programme entirely, so an
                estimate here would promise credit that never arrives. */}
            {!quoteOnly && !product.exclusive && <WalletLine amount={price * qty} />}

            {/* What "sold on its own terms" costs the buyer in practice. Said
                before the bag rather than sprung at checkout, because two of
                the three are restrictions: card only, and on its own. */}
            {product.exclusive && <ExclusiveTerms />}
            {quoteOnly && cfp.note && <p className="mt-3 text-sm text-as-ink/55">{cfp.note}</p>}

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
              {!quoteOnly && bulk && (
                <QtyField value={qty} min={minQty} max={maxQty} step={qtyStep} onChange={setQty} size="md" />
              )}
              {!quoteOnly && !bulk && (
              <div className="flex items-center rounded-full border border-as-ink/15">
                <button
                  onClick={() => {
                    setQty((q) => Math.max(1, q - 1))
                    setMaxHit(false)
                  }}
                  className="flex h-11 w-11 items-center justify-center text-as-ink/60 hover:text-as-ink disabled:opacity-30"
                  disabled={qty <= 1}
                  aria-label="Decrease quantity"
                >
                  <Icon name="minus" className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-medium text-as-ink">{qty}</span>
                <button
                  onClick={inc}
                  className={`flex h-11 w-11 items-center justify-center hover:text-as-ink ${
                    qty >= maxQty ? 'text-as-ink/25' : 'text-as-ink/60'
                  }`}
                  aria-label="Increase quantity"
                >
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              </div>
              )}
              {quoteOnly ? (
                enquireHref ? (
                  <a
                    href={enquireHref}
                    target="_blank"
                    rel="noreferrer"
                    className="pill flex-1 justify-center sm:flex-none sm:px-10"
                  >
                    <Icon name="whatsapp" className="h-[18px] w-[18px]" />
                    {cfp.button}
                  </a>
                ) : (
                  // Nowhere to send them: no WhatsApp number and no override URL
                  // in Settings. Say so plainly rather than render a dead button.
                  <p className="text-sm text-as-ink/55">Contact us for a price on this product.</p>
                )
              ) : (
                <button onClick={add} className="pill flex-1 justify-center sm:flex-none sm:px-10">
                  Add to Bag
                </button>
              )}
              <ShareMenu
                url={product.slug ? `${SITE_URL}/product/${product.slug}` : undefined}
                title={product.name}
                label={`Share ${product.name}`}
                sizeClass="h-11 w-11 shrink-0"
                iconClass="h-[18px] w-[18px]"
                className="border-as-ink/15"
              />
            </div>

            {/* Where the quantity is typed rather than tapped, the arithmetic
                belongs on screen: at $1 a licence the number in the box and the
                amount charged are the same figure, and showing it spelled out
                is what makes that legible before the bag, not after. */}
            {!quoteOnly && bulk && qty > 1 && (
              <p className="mt-3 text-sm text-as-ink/60">
                {formatQty(qty)} × {money(price)} ={' '}
                <strong className="font-semibold text-as-ink">{money(price * qty)}</strong>
              </p>
            )}

            {/* The WhatsApp note is for the store's own 2-per-order cap, and is
                raised by the stepper when + is pressed at the ceiling. A bulk
                product has no stepper to press, and "order more on WhatsApp" is
                the wrong answer for it anyway — it states its range instead, up
                front, so a typed 99,999 being clamped is never a surprise. */}
            {!quoteOnly && !bulk && maxHit && (
              <MaxQtyNote whatsapp={whatsapp} product={product.name} className="mt-3" />
            )}
            {!quoteOnly && bulk && (
              <p className="mt-3 text-sm text-as-ink/50">
                {minQty > 1 ? `${formatQty(minQty)}–` : 'Up to '}
                {maxQty.toLocaleString()} per order
                {/* Only worth saying where it is not obvious: on a whole-unit
                    product "in steps of 1" is noise. */}
                {qtyStep < 1 ? ' · halves and decimals are fine' : ''}
              </p>
            )}

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

// The three things an exclusive product does differently, stated plainly.
// Deliberately not a marketing box: two of the lines are limits, and a customer
// who finds out at the payment step that cash on delivery isn't offered has
// been told too late.
function ExclusiveTerms() {
  const lines = [
    ['globe', 'Paid online with Whish Pay — no cash on delivery'],
    ['check', 'No VAT and no delivery charge — the price is the total'],
    ['bag', 'Bought on its own, separately from other items'],
  ]
  return (
    <ul className="mt-4 space-y-2 rounded-xl bg-as-fog px-4 py-3">
      {lines.map(([icon, text]) => (
        <li key={text} className="flex items-start gap-2.5 text-sm text-as-ink/70">
          <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-as-red" />
          {text}
        </li>
      ))}
    </ul>
  )
}

// "Get $63.00 back in your AS Wallet." Renders nothing at all unless the wallet
// is running and this amount actually earns something, so a shop with no scheme
// sees no trace of it.
//
// The figure follows the quantity stepper because that is what the order will
// be worth — and it can be stated as money now, in full, because that is
// exactly what lands: there is no block to reach and nothing to redeem first.
function WalletLine({ amount }) {
  const { data: rules } = useWallet()
  const credit = creditFor(amount, rules)
  if (!credit) return null

  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-as-fog px-4 py-3">
      <Icon name="star" className="mt-0.5 h-4 w-4 shrink-0 text-as-red" />
      <p className="text-sm text-as-ink/70">
        Get <strong className="font-semibold text-as-ink">{money(credit)}</strong> back in your{' '}
        {rules.title || 'AS Wallet'}
        <span className="block text-xs text-as-ink/45">
          Spend it on any future order · added once yours is delivered
        </span>
      </p>
    </div>
  )
}
