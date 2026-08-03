'use client'

import { Fragment, use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDispatch } from 'react-redux'
import Icon from '@/components/Icon.jsx'
import { clearCart } from '@/store/cartSlice'
import { useAccount, accountApi } from '@/lib/account'
import { statusMeta, statusClasses, money, orderDate, orderTotal } from '@/lib/orders'
import { trackPurchase } from '@/lib/analytics'

const STEPS = ['pending', 'confirmed', 'shipped', 'delivered']

export default function OrderPage({ params }) {
  params = use(params)
  const id = params.id
  const { customer, loading } = useAccount()
  const router = useRouter()
  const dispatch = useDispatch()
  const search = useSearchParams()
  const placed = search.get('placed') === '1'
  const failed = search.get('failed') === '1'
  // Track token from a guest checkout — grants read access to this one order
  // without a signed-in session.
  const trackToken = search.get('t') || ''

  const [order, setOrder] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | error
  const polledRef = useRef(false) // guards the one-time payment re-check loop
  const clearedRef = useRef(false) // clears the bag once, when payment confirms

  useEffect(() => {
    if (loading) return
    if (!customer && !trackToken) {
      router.replace(`/login?next=/account/orders/${id}`)
      return
    }
    const load = customer ? accountApi.getOrder(id) : accountApi.trackOrder(id, trackToken)
    load
      .then((o) => {
        setOrder(o)
        setState('ready')
      })
      .catch(() => {
        // A signed-in session that doesn't own the order can still view it via
        // a valid track token (e.g. ordered for someone else while logged out).
        if (customer && trackToken) {
          accountApi
            .trackOrder(id, trackToken)
            .then((o) => {
              setOrder(o)
              setState('ready')
            })
            .catch(() => setState('error'))
        } else {
          setState('error')
        }
      })
  }, [loading, customer, id, trackToken, router])

  // Returning from Whish, the order may still read unpaid until the callback lands
  // (and in local testing without a public callback, until we ask). Re-check the
  // payment against the API a few times; the server settles it on a paid status.
  useEffect(() => {
    if (state !== 'ready' || !order) return
    if (order.paymentMethod !== 'whish' || order.paymentStatus === 'paid') return
    if (polledRef.current) return
    polledRef.current = true
    let cancelled = false
    let tries = 0
    const tick = async () => {
      tries += 1
      try {
        const fresh = await accountApi.reconcilePayment(order.id, trackToken)
        if (cancelled) return
        setOrder(fresh)
        if (fresh.paymentStatus === 'paid' || fresh.status === 'cancelled') return
      } catch {
        /* keep trying */
      }
      if (!cancelled && tries < 4) setTimeout(tick, 2500)
    }
    tick()
    return () => {
      cancelled = true
    }
  }, [state, order, trackToken])

  // Empty the bag only once payment is confirmed (the checkout deferred this for
  // online orders so an abandoned payment doesn't lose the cart).
  useEffect(() => {
    if (order?.paymentMethod === 'whish' && order?.paymentStatus === 'paid' && !clearedRef.current) {
      clearedRef.current = true
      dispatch(clearCart())
    }
  }, [order, dispatch])

  // The conversion. This is the number Google Ads bids on, so it reports the
  // sale exactly once and only when there really is one:
  //   • ?placed=1 — arriving here from the checkout, not from order history.
  //   • Whish orders wait for the money; cash on delivery counts immediately.
  //   • A localStorage mark stops a refresh re-sending it. Google also dedupes
  //     on transaction_id, so a cleared browser can't double-count either.
  useEffect(() => {
    if (!placed || state !== 'ready' || !order) return
    if (order.paymentMethod === 'whish' && order.paymentStatus !== 'paid') return
    const key = `as_store_purchase_${order.id}`
    let done = false
    try {
      done = localStorage.getItem(key) === '1'
      if (!done) localStorage.setItem(key, '1')
    } catch {
      /* private mode — fall back to Google's own transaction_id dedupe */
    }
    if (done) return
    trackPurchase({
      id: order.id,
      total: orderTotal(order),
      deliveryFee: order.deliveryFee,
      // productId, not the order-line id — it has to match what add_to_cart and
      // the product feed call this item.
      items: (order.items || []).map((it) => ({
        id: it.productId ?? it.id,
        name: it.name,
        price: it.price,
        qty: it.qty,
      })),
    })
  }, [placed, state, order])

  if (state === 'loading' || loading) {
    return (
      <section className="bg-white pt-28 sm:pt-32">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center text-as-ink/40">Loading…</div>
      </section>
    )
  }

  if (state === 'error' || !order) {
    return (
      <section className="bg-white pb-24 pt-28 text-center sm:pt-32">
        <div className="shell">
          <h1 className="text-2xl font-semibold tracking-apple text-as-ink">Order not found</h1>
          <Link href="/account" className="link-cta mt-4 justify-center">
            Back to your account <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="mx-auto w-full max-w-3xl px-6">
        <Link href="/account" className="inline-flex items-center gap-1 text-sm font-medium text-as-ink/55 hover:text-as-red">
          <Icon name="chevronLeft" className="h-4 w-4" /> Your account
        </Link>

        {order.paymentMethod === 'whish' ? (
          order.paymentStatus === 'paid' ? (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
              <Icon name="check" className="h-6 w-6" />
              <div>
                <p className="font-semibold">Payment received — thank you!</p>
                <p className="text-sm text-emerald-700/80">Your order is confirmed. You can track its status below.</p>
              </div>
            </div>
          ) : order.status === 'cancelled' ? null : (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 p-4 text-amber-800">
              <Icon name="box" className="h-6 w-6" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{failed ? 'Payment not completed' : 'Confirming your payment…'}</p>
                <p className="text-sm text-amber-700/80">
                  {failed
                    ? 'Your payment wasn’t completed. You can finish paying below.'
                    : 'This can take a few seconds. If it doesn’t update on its own, use the button to finish paying.'}
                </p>
              </div>
              {order.collectUrl && (
                <a href={order.collectUrl} className="pill shrink-0">Complete payment</a>
              )}
            </div>
          )
        ) : (
          placed && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
              <Icon name="check" className="h-6 w-6" />
              <div>
                <p className="font-semibold">Order placed — thank you!</p>
                <p className="text-sm text-emerald-700/80">We’ll confirm it shortly. You can track its status below.</p>
              </div>
            </div>
          )
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-apple text-as-ink">Order #{order.id}</h1>
            <p className="mt-1 text-sm text-as-ink/50">Placed {orderDate(order.createdAt)}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusClasses(order.status)}`}>
            {statusMeta(order.status).label}
          </span>
        </div>

        {/* Status timeline */}
        <div className="mt-8 rounded-2xl border border-as-ink/10 p-6">
          {order.status === 'cancelled' ? (
            <p className="text-center font-medium text-red-600">This order was cancelled.</p>
          ) : (
            <div className="flex items-center">
              {STEPS.map((s, i) => {
                const idx = STEPS.indexOf(order.status)
                const done = i <= idx
                return (
                  <Fragment key={s}>
                    <div className="flex flex-col items-center">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-as-red text-white' : 'bg-as-ink/10 text-as-ink/40'}`}>
                        {done ? <Icon name="check" className="h-4 w-4" /> : i + 1}
                      </span>
                      <span className={`mt-1.5 text-[11px] sm:text-xs ${done ? 'font-medium text-as-ink' : 'text-as-ink/40'}`}>
                        {statusMeta(s).label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`mx-1 h-0.5 flex-1 ${i < idx ? 'bg-as-red' : 'bg-as-ink/10'}`} />
                    )}
                  </Fragment>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          {/* Items */}
          <div className="rounded-2xl border border-as-ink/10 p-6">
            <h2 className="text-lg font-semibold text-as-ink">Items</h2>
            <ul className="mt-4 divide-y divide-as-ink/8">
              {(order.items || []).map((it) => (
                <li key={it.id} className="flex items-center gap-4 py-3">
                  <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-as-fog">
                    {it.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image} alt={it.name} className="h-full w-full object-cover" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-as-ink">{it.name}</p>
                    <p className="text-sm text-as-ink/50">Qty {it.qty} · {money(it.price)}</p>
                  </div>
                  <span className="font-medium text-as-ink">{money(Number(it.price) * it.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-2 border-t border-as-ink/10 pt-4 text-sm">
              {Number(order.deliveryFee) > 0 && (
                <>
                  <div className="flex items-center justify-between text-as-ink/60">
                    <span>Subtotal</span>
                    <span>{money(order.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-as-ink/60">
                    <span>Delivery</span>
                    <span>{money(order.deliveryFee)}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-as-ink/60">
                  Total ·{' '}
                  {order.paymentMethod === 'whish'
                    ? order.paymentStatus === 'paid'
                      ? 'Paid online'
                      : 'Online payment'
                    : 'Cash on delivery'}
                </span>
                <span className="text-xl font-semibold text-as-ink">{money(orderTotal(order))}</span>
              </div>
            </div>
          </div>

          {/* Delivery */}
          <div className="h-fit rounded-2xl border border-as-ink/10 p-6">
            <h2 className="text-lg font-semibold text-as-ink">Delivery</h2>
            <div className="mt-3 space-y-1 text-sm text-as-ink/70">
              <p className="font-medium text-as-ink">{order.fullName}</p>
              {order.phone && <p>{order.phone}</p>}
              {order.address && <p>{order.address}</p>}
              {order.city && <p>{order.city}</p>}
              {order.notes && <p className="mt-2 text-as-ink/50">“{order.notes}”</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
