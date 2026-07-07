'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSelector, useDispatch } from 'react-redux'
import { AnimatePresence, motion } from 'framer-motion'
import Icon from './Icon.jsx'
import MaxQtyNote from './MaxQtyNote.jsx'
import { selectCartItems, selectCartTotal, removeItem, setQty, setItemSlug, clearCart, MAX_QTY } from '@/store/cartSlice'
import { selectCartOpen, closeCart } from '@/store/uiSlice'

const money = (n) => `$${Number(n || 0).toLocaleString()}`
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

// Slide-over shopping bag. Opens from the nav's bag icon, lists items with
// quantity steppers, and checks out on-site at /checkout.
export default function CartDrawer({ whatsapp }) {
  const open = useSelector(selectCartOpen)
  const items = useSelector(selectCartItems)
  const total = useSelector(selectCartTotal)
  const dispatch = useDispatch()
  const router = useRouter()
  // Item whose + was clicked at the cap — shows the WhatsApp note under it.
  const [maxHitId, setMaxHitId] = useState(null)

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Backfill slugs for items saved before slugs were tracked, so every bag item
  // links to its product page. Runs when the drawer opens.
  useEffect(() => {
    if (!open) return
    const missing = items.filter((i) => !i.slug && i.id)
    if (missing.length === 0) return
    let cancelled = false
    missing.forEach(async (i) => {
      try {
        const res = await fetch(`${API}/api/products/id/${i.id}`)
        if (!res.ok) return
        const p = await res.json()
        if (!cancelled && p?.slug) dispatch(setItemSlug({ id: i.id, slug: p.slug }))
      } catch {
        /* ignore — item just stays non-clickable */
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, items, dispatch])

  const checkout = () => {
    dispatch(closeCart())
    router.push('/checkout')
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => dispatch(closeCart())} />

          <motion.aside
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <div className="flex items-center justify-between border-b border-as-ink/10 px-5 py-4">
              <h2 className="text-lg font-semibold tracking-apple text-as-ink">Your bag</h2>
              <button
                onClick={() => dispatch(closeCart())}
                className="rounded-lg p-1.5 text-as-ink/50 hover:bg-as-fog hover:text-as-ink"
                aria-label="Close bag"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <Icon name="bag" className="h-10 w-10 text-as-ink/25" />
                <p className="text-as-ink/50">Your bag is empty.</p>
                <button onClick={() => dispatch(closeCart())} className="link-cta">
                  Continue shopping <Icon name="chevronRight" className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <ul className="flex-1 divide-y divide-as-ink/8 overflow-y-auto px-5">
                  {items.map((i) => {
                    // Tapping the photo or name jumps to the product page (closing
                    // the drawer). Items saved before slugs were tracked stay static.
                    const href = i.slug ? `/product/${i.slug}` : null
                    const Thumb = href ? Link : 'span'
                    const thumbProps = href
                      ? { href, onClick: () => dispatch(closeCart()) }
                      : {}
                    return (
                    <li key={i.id} className="flex gap-4 py-4">
                      <Thumb
                        {...thumbProps}
                        className={`h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-as-fog ${href ? 'cursor-pointer' : ''}`}
                      >
                        {i.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={i.image} alt={i.title} className="h-full w-full object-cover" />
                        )}
                      </Thumb>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          {href ? (
                            <Link
                              href={href}
                              onClick={() => dispatch(closeCart())}
                              className="block min-w-0 truncate font-medium text-as-ink transition-colors hover:text-as-red"
                            >
                              {i.title}
                            </Link>
                          ) : (
                            <p className="truncate font-medium text-as-ink">{i.title}</p>
                          )}
                          <button
                            onClick={() => dispatch(removeItem(i.id))}
                            className="shrink-0 rounded-lg p-1 text-as-ink/40 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Remove ${i.title}`}
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="mt-0.5 text-sm text-as-ink/50">{money(i.price)}</p>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="flex items-center rounded-full border border-as-ink/15">
                            <button
                              onClick={() => {
                                dispatch(setQty({ id: i.id, qty: i.qty - 1 }))
                                if (maxHitId === i.id) setMaxHitId(null)
                              }}
                              className="flex h-7 w-7 items-center justify-center text-as-ink/60 hover:text-as-ink disabled:opacity-30"
                              disabled={i.qty <= 1}
                              aria-label="Decrease quantity"
                            >
                              <Icon name="minus" className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-7 text-center text-sm font-medium text-as-ink">{i.qty}</span>
                            <button
                              onClick={() => {
                                if (i.qty >= MAX_QTY) setMaxHitId(i.id)
                                else dispatch(setQty({ id: i.id, qty: i.qty + 1 }))
                              }}
                              className={`flex h-7 w-7 items-center justify-center hover:text-as-ink ${
                                i.qty >= MAX_QTY ? 'text-as-ink/25' : 'text-as-ink/60'
                              }`}
                              aria-label="Increase quantity"
                            >
                              <Icon name="plus" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <span className="ml-auto font-medium text-as-ink">
                            {money(Number(i.price) * i.qty)}
                          </span>
                        </div>
                        {maxHitId === i.id && (
                          <MaxQtyNote whatsapp={whatsapp} product={i.title} className="mt-2" />
                        )}
                      </div>
                    </li>
                    )
                  })}
                </ul>

                <div className="space-y-3 border-t border-as-ink/10 p-5">
                  <div className="flex items-center justify-between text-base">
                    <span className="text-as-ink/60">Subtotal</span>
                    <span className="text-lg font-semibold text-as-ink">{money(total)}</span>
                  </div>
                  <button onClick={checkout} className="pill w-full justify-center">
                    Checkout
                  </button>
                  <button
                    onClick={() => dispatch(clearCart())}
                    className="block w-full text-center text-sm text-as-ink/45 hover:text-as-red"
                  >
                    Clear bag
                  </button>
                </div>
              </>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
