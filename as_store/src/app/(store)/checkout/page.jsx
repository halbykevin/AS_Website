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
  const { customer, setCustomer } = useAccount()
  const router = useRouter()
  const items = useSelector(selectCartItems)
  const total = useSelector(selectCartTotal)
  const dispatch = useDispatch()

  const [form, setForm] = useState({ fullName: '', phone: '', email: '', address: '', city: '', notes: '', saveAddress: true })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [addrId, setAddrId] = useState(null) // selected saved-address id | 'new' | null
  const seeded = useRef(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const savedAddresses = Array.isArray(customer?.addresses) ? customer.addresses : []

  // Fill the form from a saved address.
  const applyAddress = (a) => {
    setAddrId(a.id)
    setForm((f) => ({
      ...f,
      fullName: a.fullName || f.fullName,
      phone: a.phone || f.phone,
      address: a.address || '',
      city: a.city || '',
    }))
  }

  // No login required — the mobile number identifies (or creates) the account.
  // Prefill once when a session exists: from the default saved address if there
  // is one, else from the flat profile fields.
  useEffect(() => {
    if (customer && !seeded.current) {
      seeded.current = true
      const addrs = Array.isArray(customer.addresses) ? customer.addresses : []
      const def = addrs.find((a) => a.isDefault) || addrs[0]
      if (def) {
        setAddrId(def.id)
        setForm((f) => ({
          ...f,
          fullName: def.fullName || customer.name || '',
          phone: def.phone || customer.phone || customer.mobile || '',
          email: customer.email || '',
          address: def.address || '',
          city: def.city || '',
        }))
      } else {
        setForm((f) => ({
          ...f,
          fullName: customer.name || '',
          phone: customer.phone || customer.mobile || '',
          email: customer.email || '',
          address: customer.address || '',
        }))
      }
    }
  }, [customer])

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
        email: form.email,
        address: form.address,
        city: form.city,
        notes: form.notes,
        saveAddress: form.saveAddress,
      })
      if (form.saveAddress) {
        setCustomer((c) => (c ? { ...c, name: form.fullName, phone: form.phone, email: form.email, address: form.address } : c))
      }
      dispatch(clearCart())
      // The track token lets the confirmation page load without a session.
      router.push(`/account/orders/${order.id}?placed=1&t=${encodeURIComponent(order.trackToken || '')}`)
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

            {savedAddresses.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-as-ink/70">Deliver to</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {savedAddresses.map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => applyAddress(a)}
                      className={`rounded-xl border p-3 text-left transition ${
                        addrId === a.id ? 'border-as-red ring-1 ring-as-red' : 'border-as-ink/15 hover:border-as-ink/30'
                      }`}
                    >
                      <span className="block text-sm font-semibold text-as-ink">
                        {a.title || 'Address'}
                        {a.isDefault ? ' · Default' : ''}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-as-ink/55">
                        {[a.address, a.city].filter(Boolean).join(', ')}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setAddrId('new')
                      setForm((f) => ({ ...f, address: '', city: '' }))
                    }}
                    className={`rounded-xl border border-dashed p-3 text-left text-sm font-medium transition ${
                      addrId === 'new' ? 'border-as-red text-as-red ring-1 ring-as-red' : 'border-as-ink/25 text-as-ink/60 hover:border-as-ink/40'
                    }`}
                  >
                    + Use a new address
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-4">
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
              <Field label="Full name">
                <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className={inputCls} required />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Mobile number">
                  <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} required placeholder="70 123 456" autoComplete="tel" />
                </Field>
                <Field label="Email (optional)" hint="For your order confirmation.">
                  <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} autoComplete="email" />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="City / area">
                  <input value={form.city} onChange={(e) => set('city', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Address">
                  <input value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} required placeholder="Street, building, floor…" />
                </Field>
              </div>
              <Field label="Notes (optional)">
                <input value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inputCls} placeholder="Delivery instructions…" />
              </Field>
              <label className="flex items-center gap-2 text-sm text-as-ink/70">
                <input type="checkbox" checked={form.saveAddress} onChange={(e) => set('saveAddress', e.target.checked)} className="h-4 w-4 accent-as-red" />
                Save these details for next time
              </label>
              {!customer && (
                <p className="text-xs text-as-ink/45">
                  Your order is saved under your mobile number — sign in with it anytime to track your orders.
                </p>
              )}
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
            <p className="mt-3 text-center text-xs text-as-ink/45">Free delivery on orders over $100 · 12 months warranty</p>
          </div>
        </form>
      </div>
    </section>
  )
}
