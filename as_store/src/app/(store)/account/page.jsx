'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon.jsx'
import { useAccount, accountApi } from '@/lib/account'
import { Field, inputCls } from '@/components/AccountUI.jsx'
import { statusMeta, statusClasses, money, orderDate } from '@/lib/orders'

export default function AccountPage() {
  const { customer, loading, logout, setCustomer } = useAccount()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !customer) router.replace('/login')
  }, [loading, customer, router])

  if (loading || !customer) {
    return (
      <section className="bg-white pt-28 sm:pt-32">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center text-as-ink/40">Loading…</div>
      </section>
    )
  }

  return (
    <section className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="mx-auto w-full max-w-2xl px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-apple text-as-ink sm:text-4xl">
              {customer.name ? `Hi, ${customer.name.split(' ')[0]}` : 'Your account'}
            </h1>
            <p className="mt-1 text-as-ink/55">{customer.mobile ? `+${customer.mobile}` : customer.email}</p>
          </div>
          <button
            onClick={() => {
              logout()
              router.push('/')
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-as-ink/15 px-4 py-2 text-sm font-medium text-as-ink/70 hover:border-as-ink/30"
          >
            <Icon name="logout" className="h-4 w-4" /> Sign out
          </button>
        </div>

        <OrdersList />

        <ProfileForm customer={customer} onSaved={setCustomer} />
      </div>
    </section>
  )
}

function OrdersList() {
  const [orders, setOrders] = useState(null)
  useEffect(() => {
    accountApi.listOrders().then(setOrders).catch(() => setOrders([]))
  }, [])

  return (
    <div className="mt-10 rounded-2xl border border-as-ink/10 p-6">
      <h2 className="text-lg font-semibold text-as-ink">Your orders</h2>
      {orders === null ? (
        <p className="mt-2 text-sm text-as-ink/40">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="mt-2 text-sm text-as-ink/50">
          You haven’t placed any orders yet. Once you check out, your orders and their status will show up here.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-as-ink/8">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/account/orders/${o.id}`} className="flex items-center gap-4 py-3 transition hover:opacity-80">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-as-ink">Order #{o.id}</p>
                  <p className="text-xs text-as-ink/50">
                    {orderDate(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClasses(o.status)}`}>
                  {statusMeta(o.status).label}
                </span>
                <span className="w-20 text-right font-medium text-as-ink">{money(o.subtotal)}</span>
                <Icon name="chevronRight" className="h-4 w-4 text-as-ink/30" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProfileForm({ customer, onSaved }) {
  const [form, setForm] = useState({
    name: customer.name || '',
    phone: customer.phone || '',
    email: customer.email || '',
    address: customer.address || '',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    setError('')
    try {
      const updated = await accountApi.update({
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
      })
      onSaved(updated)
      setMsg('Saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="mt-6 rounded-2xl border border-as-ink/10 p-6">
      <h2 className="text-lg font-semibold text-as-ink">Profile & delivery details</h2>
      <div className="mt-4 space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <Field label="Full name">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} placeholder="+961 …" />
          </Field>
          <Field label="Email (optional)" hint="For your order confirmations.">
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} autoComplete="email" />
          </Field>
        </div>
        <Field label="Address">
          <input value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} />
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className="pill px-8">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          {msg && <span className="text-sm font-medium text-emerald-600">{msg}</span>}
        </div>
      </div>
    </form>
  )
}
