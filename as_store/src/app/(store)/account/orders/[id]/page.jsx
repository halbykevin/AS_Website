'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Icon from '@/components/Icon.jsx'
import { useAccount, accountApi } from '@/lib/account'
import { statusMeta, statusClasses, money, orderDate } from '@/lib/orders'

const STEPS = ['pending', 'confirmed', 'shipped', 'delivered']

export default function OrderPage({ params }) {
  const id = params.id
  const { customer, loading } = useAccount()
  const router = useRouter()
  const search = useSearchParams()
  const placed = search.get('placed') === '1'
  // Track token from a guest checkout — grants read access to this one order
  // without a signed-in session.
  const trackToken = search.get('t') || ''

  const [order, setOrder] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | error

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

        {placed && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
            <Icon name="check" className="h-6 w-6" />
            <div>
              <p className="font-semibold">Order placed — thank you!</p>
              <p className="text-sm text-emerald-700/80">We’ll confirm it shortly. You can track its status below.</p>
            </div>
          </div>
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
            <div className="mt-4 flex items-center justify-between border-t border-as-ink/10 pt-4">
              <span className="text-as-ink/60">Total · Cash on delivery</span>
              <span className="text-xl font-semibold text-as-ink">{money(order.subtotal)}</span>
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
