'use client'

import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { accountApi, useAccount } from '@/lib/account'
import { Field, inputCls } from './AccountUI.jsx'
import { isValidMobile, money } from '@/lib/orders'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

const dateOf = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// The buy box for an AS-Punch licence renewal: /product/RaiOne?renewal=<code>.
//
// The amount is the licence server's, shown in a disabled field — there is
// nothing to type and nothing to add to the bag. The server re-resolves the
// code when the order is created and prices the line from that, so this figure
// is a display of the decision, never an input to it (server/src/licenseRenewal.js).
export default function LicenseRenewalBox({ code, product }) {
  const { customer } = useAccount() || {}
  const [renewal, setRenewal] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [form, setForm] = useState({ fullName: '', phone: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoadError('')
    fetch(`${API}/api/license-renewals/${encodeURIComponent(code)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok || res.status === 404) setRenewal(body.status ? body : { status: 'not_found', message: 'This renewal link is not valid.' })
        else setLoadError(body.error || 'Could not load this renewal. Please try again.')
      })
      .catch(() => !cancelled && setLoadError('Could not load this renewal. Please check your connection and try again.'))
    return () => {
      cancelled = true
    }
  }, [code, attempt])

  // A signed-in customer's details, so the form is usually already filled.
  useEffect(() => {
    if (!customer) return
    setForm((f) => ({
      fullName: f.fullName || customer.name || '',
      phone: f.phone || customer.phone || customer.mobile || '',
      email: f.email || customer.email || '',
    }))
  }, [customer])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const pay = async (e) => {
    e.preventDefault()
    if (!form.fullName.trim()) {
      setError('Enter your name.')
      return
    }
    if (!isValidMobile(form.phone)) {
      setError('Enter a valid mobile number so we can reach you about this payment.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const order = await accountApi.createOrder({
        // The quantity is ignored for a renewal — the API prices the line from
        // the licence server. It is sent only because every order has items.
        items: [{ productId: product.id, qty: renewal.amount }],
        licenseRenewal: code,
        fullName: form.fullName.trim(),
        phone: form.phone,
        email: form.email.trim(),
        paymentMethod: 'whish',
      })
      if (!order.collectUrl) throw new Error('Could not start the online payment. Please try again.')
      window.location.href = order.collectUrl
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        <p>{loadError}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 font-semibold underline">
          Try again
        </button>
      </div>
    )
  }

  if (!renewal) {
    return (
      <div className="mt-8 space-y-3" aria-busy="true">
        <div className="h-6 w-2/3 animate-pulse rounded bg-as-fog" />
        <div className="h-12 animate-pulse rounded-xl bg-as-fog" />
      </div>
    )
  }

  if (renewal.status === 'paid') {
    return (
      <div className="mt-8 flex items-start gap-3 rounded-2xl bg-emerald-50 p-5 text-emerald-800">
        <Icon name="check" className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <p className="font-semibold">Already paid — this licence is renewed</p>
          <p className="text-sm text-emerald-700/80">
            {renewal.companyName ? `${renewal.companyName}'s licence` : 'The licence'} runs until {dateOf(renewal.newExpiresAt)}.
          </p>
        </div>
      </div>
    )
  }

  if (renewal.status !== 'payable') {
    return (
      <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        <p className="font-semibold">This renewal link can't be paid</p>
        <p className="mt-1 text-amber-700/90">{renewal.message || 'This renewal link is not valid.'}</p>
      </div>
    )
  }

  const months = renewal.periodMonths || 1

  return (
    <form onSubmit={pay} className="mt-8 rounded-2xl border border-as-ink/10 p-5 sm:p-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-as-red">AS-Punch licence renewal</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-apple text-as-ink">{renewal.companyName || 'Your business'}</h2>
      <p className="mt-2 text-sm text-as-ink/60">
        Renews for {months} month{months === 1 ? '' : 's'}
        {renewal.newExpiresAt ? <> — until <strong className="font-semibold text-as-ink">{dateOf(renewal.newExpiresAt)}</strong></> : null}
        {renewal.licenseExpiresAt ? ` (currently ${new Date(renewal.licenseExpiresAt) < new Date() ? 'expired on' : 'expires'} ${dateOf(renewal.licenseExpiresAt)})` : ''}.
      </p>

      <div className="mt-5">
        <label htmlFor="renewal-amount" className="mb-1.5 block text-sm font-medium text-as-ink/70">
          Amount (set by your licence)
        </label>
        {/* Disabled on purpose: the amount is fixed per business by the
            licensing dashboard, and the server charges its own figure anyway. */}
        <input
          id="renewal-amount"
          value={`${money(renewal.amount)} ${renewal.currency || 'USD'}`}
          disabled
          readOnly
          aria-readonly="true"
          className={`${inputCls} cursor-not-allowed border-as-ink/10 bg-as-fog text-lg font-semibold text-as-ink/60`}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Your name">
          <input value={form.fullName} onChange={set('fullName')} className={inputCls} autoComplete="name" required />
        </Field>
        <Field label="Mobile number">
          <input value={form.phone} onChange={set('phone')} className={inputCls} autoComplete="tel" inputMode="tel" placeholder="70 123 456" required />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Email (optional)" hint="For the receipt.">
            <input type="email" value={form.email} onChange={set('email')} className={inputCls} autoComplete="email" />
          </Field>
        </div>
      </div>

      {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

      <button type="submit" disabled={busy} className="pill mt-6 w-full justify-center disabled:opacity-60">
        {busy ? 'Starting payment…' : `Pay ${money(renewal.amount)} with Whish`}
      </button>
      <p className="mt-3 text-center text-xs text-as-ink/45">
        Your licence is renewed automatically once the payment goes through.
      </p>
    </form>
  )
}
