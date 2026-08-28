'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useSelector, useDispatch } from 'react-redux'
import { selectCartItems, selectCartTotal, clearCart } from '@/store/cartSlice'
import Icon from '@/components/Icon.jsx'
import { useAccount, accountApi } from '@/lib/account'
import { Field, inputCls } from '@/components/AccountUI.jsx'
import { money, deliveryFeeFor, vatAmountFor, isValidMobile } from '@/lib/orders'
import { trackBeginCheckout } from '@/lib/analytics'
import { useWallet, creditFor, spendableOn } from '@/lib/wallet'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

export default function CheckoutPage() {
  const { customer, setCustomer } = useAccount()
  const router = useRouter()
  const items = useSelector(selectCartItems)
  const total = useSelector(selectCartTotal)
  const dispatch = useDispatch()
  const qc = useQueryClient()

  const [form, setForm] = useState({ fullName: '', phone: '', email: '', address: '', city: '', notes: '', saveAddress: true })
  // Focused when the number is missing or malformed, so the error names a field
  // the shopper is already looking at.
  const phoneRef = useRef(null)
  const [pay, setPay] = useState('cod') // 'cod' | 'whish'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [addrId, setAddrId] = useState(null) // selected saved-address id | 'new' | null
  const seeded = useRef(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // Delivery and VAT pricing, fetched live so the summary matches what the API
  // will charge. Until it arrives delivery shows as free and no VAT line
  // appears, rather than guessing numbers the server might not agree with.
  const [delivery, setDelivery] = useState(null)
  const [vat, setVat] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(`${API}/api/settings`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!alive || !s) return
        if (s.delivery) setDelivery(s.delivery)
        if (s.vat) setVat(s.vat)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const deliveryFee = deliveryFeeFor(total, delivery)

  // Rewards on this account — Daily Spin wins and staff grants.
  // The server prices each one against this exact cart (`eligible` + `discount`
  // come back with the list), so this page only renders its answer; the order it
  // places is re-priced server-side regardless.
  const [voucherCode, setVoucherCode] = useState('')
  const [rewards, setRewards] = useState([])
  useEffect(() => {
    if (!customer || !items.length) {
      setRewards([])
      return undefined
    }
    let alive = true
    accountApi
      .vouchers(total)
      .then((list) => alive && setRewards(Array.isArray(list) ? list : []))
      .catch(() => alive && setRewards([]))
    return () => {
      alive = false
    }
  }, [customer, items.length, total])

  const usable = rewards.filter((v) => v.eligible)
  const applied = usable.find((v) => v.code === voucherCode) || null

  // A free-delivery reward waives the fee; everything else comes off the items.
  // VAT follows what is actually payable, matching the API's own arithmetic.
  const deliveryWaived = applied?.type === 'free_delivery' ? deliveryFee : 0
  const itemsDiscount = applied ? applied.discount - deliveryWaived : 0
  const discount = applied?.discount || 0
  // Delivery is part of the taxable amount — same base the API uses.
  const vatAmount = vatAmountFor(total - itemsDiscount + (deliveryFee - deliveryWaived), vat)
  // What is owed before the wallet. Store credit is a payment, not a discount,
  // so it comes off after VAT — the tax is on the goods whoever's money buys
  // them, and the server prices it exactly this way.
  const payable = total + deliveryFee + vatAmount - discount

  // A reward that stops applying (the bag shrank below its minimum, or it was
  // spent on another device) must not silently ride along on the order. Keyed on
  // the codes themselves, since `usable` is a fresh array on every render.
  const usableCodes = usable.map((v) => v.code).join(',')
  useEffect(() => {
    if (voucherCode && !usableCodes.split(',').includes(voucherCode)) setVoucherCode('')
  }, [usableCodes, voucherCode])

  // AS Wallet. `spendable` is the server's own answer for this exact order; the
  // mirrored helper only covers the moment before that answer arrives, and the
  // server re-decides on submit either way.
  const [useCredit, setUseCredit] = useState(false)
  const { data: wallet } = useWallet(payable)
  const walletBalance = Number(wallet?.balance || 0)
  const walletSpendable = Number(wallet?.spendable ?? spendableOn(payable, walletBalance, wallet))
  const walletApplied = useCredit ? walletSpendable : 0
  const grandTotal = Math.round((payable - walletApplied) * 100) / 100

  // Credit that stops applying — the bag shrank below the minimum, or it was
  // spent on another device — must not ride along looking like it still counts.
  useEffect(() => {
    if (useCredit && walletSpendable <= 0) setUseCredit(false)
  }, [useCredit, walletSpendable])

  // What this order gives back. Same basis the server credits on — the items,
  // after any item discount, and after whatever the wallet itself is paying,
  // which earns nothing — so the promise made here is the one kept.
  const credit = creditFor(total - itemsDiscount - walletApplied, wallet)
  const walletAfter = Math.round((walletBalance - walletApplied + credit) * 100) / 100

  // Reaching this page IS beginning checkout — reported once per visit, and
  // only once the cart has hydrated from localStorage (the first render can
  // legitimately be empty). The ref keeps a re-render from repeating it.
  const checkoutTracked = useRef(false)
  useEffect(() => {
    if (checkoutTracked.current || !items.length) return
    checkoutTracked.current = true
    trackBeginCheckout(items)
  }, [items])

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
    // Every order needs a number we can actually call, whether the shopper is a
    // guest, signed in with a code, or came through Google — the last of which
    // brings no number with it, so the field starts empty and this is the only
    // thing standing between that and an undeliverable order. The server checks
    // the same rule; this just saves the round trip.
    if (!isValidMobile(form.phone)) {
      setError('Enter a valid mobile number so we can reach you about the delivery.')
      phoneRef.current?.focus()
      return
    }
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
        paymentMethod: pay,
        ...(applied ? { voucherCode: applied.code } : null),
        // Ask for the wallet, never for an amount: the server decides what the
        // rules allow and prices the order from its own figure.
        ...(walletApplied > 0 ? { useWallet: true } : null),
      })
      // The order just moved money: credit was spent, credit is on the way, and
      // a reward may have been consumed. Drop the cached answer rather than
      // letting the account page show a balance that is a minute out of date and
      // a dollar wrong.
      qc.invalidateQueries({ queryKey: ['wallet'] })
      if (form.saveAddress) {
        setCustomer((c) => (c ? { ...c, name: form.fullName, phone: form.phone, email: form.email, address: form.address } : c))
      }
      // Online payment: hand the shopper to Whish's hosted page. The bag is NOT
      // cleared yet — it's emptied on the order page only once payment confirms,
      // so an abandoned payment doesn't lose the cart.
      if (pay === 'whish') {
        if (!order.collectUrl) throw new Error('Could not start the online payment. Please try again.')
        window.location.href = order.collectUrl
        return
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
                <Field label="Mobile number" hint="Required — we call this number to confirm delivery.">
                  <input
                    ref={phoneRef}
                    type="tel"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    className={inputCls}
                    required
                    placeholder="70 123 456"
                    autoComplete="tel"
                  />
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

            {/* Rewards. Only shown when at least one applies to this bag — an
                empty picker would just raise questions about rewards they don't
                have. Picking is optional and reversible right up to placing the
                order: tapping the applied one again puts it back. */}
            {usable.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-sm font-medium text-as-ink/70">Your rewards</p>
                <div className="grid grid-cols-1 gap-2">
                  {usable.map((v) => {
                    const on = applied?.code === v.code
                    return (
                      <button
                        type="button"
                        key={v.id}
                        onClick={() => setVoucherCode(on ? '' : v.code)}
                        aria-pressed={on}
                        className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                          on ? 'border-as-red ring-1 ring-as-red' : 'border-as-ink/15 hover:border-as-ink/30'
                        }`}
                      >
                        <Icon
                          name={on ? 'check' : 'star'}
                          className={`h-5 w-5 shrink-0 ${on ? 'text-as-red' : 'text-as-ink/35'}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-as-ink">{v.label || v.code}</span>
                          <span className="mt-0.5 block text-sm text-as-ink/55">
                            Saves {money(v.discount)}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-as-ink/45">One reward per order.</p>
              </div>
            )}

            {/* AS Wallet. Only shown when there is a balance to spend — an empty
                wallet at checkout is just a reminder of what you don't have. The
                switch is deliberate: credit is money, and money is never spent
                for someone. */}
            {walletBalance > 0 && (
              <div className="mt-6">
                <h2 className="text-lg font-semibold text-as-ink">{wallet?.title || 'AS Wallet'}</h2>
                <button
                  type="button"
                  onClick={() => walletSpendable > 0 && setUseCredit((v) => !v)}
                  aria-pressed={useCredit}
                  disabled={walletSpendable <= 0}
                  className={`mt-3 flex w-full items-center gap-3 rounded-xl border p-4 text-left transition disabled:opacity-60 ${
                    useCredit ? 'border-as-red ring-1 ring-as-red' : 'border-as-ink/15 hover:border-as-ink/30'
                  }`}
                >
                  <Icon
                    name={useCredit ? 'check' : 'star'}
                    className={`h-5 w-5 shrink-0 ${useCredit ? 'text-as-red' : 'text-as-ink/35'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-as-ink">
                      {walletSpendable > 0
                        ? `Use ${money(walletSpendable)} of your balance`
                        : 'Not usable on this order'}
                    </span>
                    <span className="mt-0.5 block text-sm text-as-ink/55">
                      {money(walletBalance)} in your wallet
                      {walletSpendable > 0 && walletSpendable < walletBalance ? ' · capped for this order' : ''}
                      {walletSpendable <= 0 && Number(wallet?.minOrder) > 0
                        ? ` · orders of ${money(wallet.minOrder)} or more`
                        : ''}
                    </span>
                  </span>
                </button>
              </div>
            )}

            <div className="mt-6">
              <p className="mb-2 text-sm font-medium text-as-ink/70">Payment</p>
              <div className="grid grid-cols-1 gap-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                    pay === 'cod' ? 'border-as-red ring-1 ring-as-red' : 'border-as-ink/15 hover:border-as-ink/30'
                  }`}
                >
                  <input type="radio" name="pay" value="cod" checked={pay === 'cod'} onChange={() => setPay('cod')} className="mt-1 h-4 w-4 accent-as-red" />
                  <span>
                    <span className="block text-sm font-semibold text-as-ink">Cash on delivery</span>
                    <span className="mt-0.5 block text-sm text-as-ink/55">Pay in cash when your order arrives. We’ll confirm it shortly after you place it.</span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                    pay === 'whish' ? 'border-as-red ring-1 ring-as-red' : 'border-as-ink/15 hover:border-as-ink/30'
                  }`}
                >
                  <input type="radio" name="pay" value="whish" checked={pay === 'whish'} onChange={() => setPay('whish')} className="mt-1 h-4 w-4 accent-as-red" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-as-ink">Pay online with</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/whish_v2.png" alt="Whish" className="h-8 w-auto" />
                    </span>
                    <span className="mt-0.5 block text-sm text-as-ink/55">Pay securely now with Whish. You’ll be taken to Whish to complete payment, then returned here.</span>
                  </span>
                </label>
              </div>
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
            <div className="mt-4 space-y-2 border-t border-as-ink/10 pt-4 text-sm">
              <div className="flex items-center justify-between text-as-ink/60">
                <span>Subtotal</span>
                <span>{money(total)}</span>
              </div>
              <div className="flex items-center justify-between text-as-ink/60">
                <span>Delivery</span>
                <span>{deliveryFee > 0 ? money(deliveryFee) : 'Free'}</span>
              </div>
              {vatAmount > 0 && (
                <div className="flex items-center justify-between text-as-ink/60">
                  <span>VAT ({Number(vat.percent)}%)</span>
                  <span>{money(vatAmount)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex items-center justify-between font-medium text-as-red">
                  <span className="truncate">{applied?.label || 'Reward'}</span>
                  <span>−{money(discount)}</span>
                </div>
              )}
              {walletApplied > 0 && (
                <div className="flex items-center justify-between font-medium text-as-red">
                  <span className="truncate">{wallet?.title || 'AS Wallet'}</span>
                  <span>−{money(walletApplied)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-as-ink/60">Total</span>
                <span className="text-xl font-semibold text-as-ink">{money(grandTotal)}</span>
              </div>
            </div>
            {/* What the order earns, kept out of the money column above — it is
                not a charge, and putting it in that stack reads like one. */}
            {credit > 0 && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-as-fog px-4 py-3">
                <Icon name="star" className="mt-0.5 h-4 w-4 shrink-0 text-as-red" />
                <p className="text-sm text-as-ink/70">
                  You’ll get{' '}
                  <strong className="font-semibold text-as-ink">{money(credit)}</strong> back in your{' '}
                  {wallet?.title || 'AS Wallet'}
                  <span className="block text-xs text-as-ink/45">
                    {walletAfter > credit
                      ? `That takes you to ${money(walletAfter)} off a future order.`
                      : 'Spend it on your next order.'}{' '}
                    Added once this order is delivered.
                  </span>
                </p>
              </div>
            )}

            <button type="submit" disabled={busy} className="pill mt-5 w-full justify-center">
              {busy ? 'Please wait…' : pay === 'whish' ? 'Continue to payment' : 'Place order'}
            </button>
            <p className="mt-3 text-center text-xs text-as-ink/45">
              {Number(delivery?.fee) > 0 && Number(delivery?.freeOver) > 0
                ? `Free delivery on orders over ${money(delivery.freeOver)} · 12 months warranty`
                : '12 months warranty'}
            </p>
          </div>
        </form>
      </div>
    </section>
  )
}
