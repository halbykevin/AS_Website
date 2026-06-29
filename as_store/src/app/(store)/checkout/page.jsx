'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSelector, useDispatch } from 'react-redux'
import { selectCartItems, selectCartTotal, clearCart } from '@/store/cartSlice'
import { useAccount } from '@/lib/account'
import { Field, inputCls } from '@/components/AccountUI.jsx'
import { money } from '@/lib/orders'

export default function CheckoutPage() {
  const { customer, loading, setCustomer } = useAccount()
  const router = useRouter()
  const items = useSelector(selectCartItems)
  const total = useSelector(selectCartTotal)
  const dispatch = useDispatch()

  const [form, setForm] = useState({ fullName: '', phone: '', address: '', city: '', notes: '', saveAddress: true })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const seeded = useRef(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // Require login.
  useEffect(() => {
    if (!loading && !customer) router.replace('/login?next=/checkout')
  }, [loading, customer, router])

  // Prefill from the saved profile once.
  useEffect(() => {
    if (customer && !seeded.current) {
      seeded.current = true
      setForm((f) => ({
        ...f,
        fullName: customer.name || '',
        phone: customer.phone || '',
        address: customer.address || '',
      }))
    }
  }, [customer])

  if (loading || !customer) {
    return (
      <section className="bg-white pt-28 sm:pt-32">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center text-as-ink/40">Loading…</div>
      </section>
    )
  }

  if (items.length === 0) {
    return (
      <section className="bg-white pb-24 pt-28 text-center sm:pt-32">
        <div className="shell">
          <h1 className="text-3xl font-semibold tracking-apple text-as-ink">Your bag is empty</h1>
          <p className="mt-3 text-as-ink/55">Add a few things before checking out.</p>
          <Link href="/" className="pill mt-6">Continue shopping</Link>
        </div>
      </section>
    )
  }

  const placeOrder = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { accountApi } = await import('@/lib/account')
      const order = await accountApi.createOrder({
        items: items.map((i) => ({ productId: i.id, qty: i.qty })),
        fullName: form.fullName,
        phone: form.phone,
        address: form.address,
        city: form.city,
        notes: form.notes,
        saveAddress: form.saveAddress,
      })
      if (form.saveAddress) {
        setCustomer((c) => (c ? { ...c, name: form.fullName, phone: form.phone, address: form.address } : c))
      }
      dispatch(clearCart())
      router.push(`/account/orders/${order.id}?placed=1`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <section className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="shell-wide">
        <h1 className="text-3xl font-semibold tracking-apple text-as-ink sm:text-4xl">Checkout</h1>

        <form onSubmit={placeOrder} className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px]">
          {/* Delivery details */}
          <div className="rounded-2xl border border-as-ink/10 p-6">
            <h2 className="text-lg font-semibold text-as-ink">Delivery details</h2>
            <div className="mt-4 space-y-4">
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
              <Field label="Full name">
                <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className={inputCls} required />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Phone">
                  <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} required placeholder="+961 …" />
                </Field>
                <Field label="City / area">
                  <input value={form.city} onChange={(e) => set('city', e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label="Address">
                <input value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} required placeholder="Street, building, floor…" />
              </Field>
              <Field label="Notes (optional)">
                <input value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inputCls} placeholder="Delivery instructions…" />
              </Field>
              <label className="flex items-center gap-2 text-sm text-as-ink/70">
                <input type="checkbox" checked={form.saveAddress} onChange={(e) => set('saveAddress', e.target.checked)} className="h-4 w-4 accent-as-red" />
                Save these details to my account
              </label>
            </div>

            <div className="mt-6 rounded-xl bg-as-fog p-4">
              <p className="text-sm font-semibold text-as-ink">Payment — Cash on delivery</p>
              <p className="mt-1 text-sm text-as-ink/55">Pay in cash when your order arrives. We’ll confirm it shortly after you place it.</p>
            </div>
          </div>

          {/* Summary */}
          <div className="h-fit rounded-2xl border border-as-ink/10 p-6 lg:sticky lg:top-24">
            <h2 className="text-lg font-semibold text-as-ink">Order summary</h2>
            <ul className="mt-4 space-y-3">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-3">
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-as-fog">
                    {i.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.image} alt={i.title} className="h-full w-full object-cover" />
                    )}
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-as-ink px-1 text-[11px] font-bold text-white">
                      {i.qty}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-as-ink">{i.title}</span>
                  <span className="text-sm font-medium text-as-ink">{money(Number(i.price) * i.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-as-ink/10 pt-4">
              <span className="text-as-ink/60">Total</span>
              <span className="text-xl font-semibold text-as-ink">{money(total)}</span>
            </div>
            <button type="submit" disabled={busy} className="pill mt-5 w-full justify-center">
              {busy ? 'Placing order…' : 'Place order'}
            </button>
            <p className="mt-3 text-center text-xs text-as-ink/45">Free delivery across Lebanon · 12-month warranty</p>
          </div>
        </form>
      </div>
    </section>
  )
}
