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

        <Link
          href="/account/notifications"
          className="mt-10 flex items-center gap-3 rounded-2xl border border-as-ink/10 p-5 transition hover:border-as-ink/25"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-as-red/10 text-as-red">
            <Icon name="bell" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-as-ink">Notifications</span>
            <span className="block text-sm text-as-ink/55">Your inbox and notification preferences</span>
          </span>
          <Icon name="chevronRight" className="h-5 w-5 text-as-ink/40" />
        </Link>

        <OrdersList />

        <AddressBook customer={customer} onSaved={setCustomer} />

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

function AddressBook({ customer, onSaved }) {
  const [list, setList] = useState(Array.isArray(customer.addresses) ? customer.addresses : [])
  const [editing, setEditing] = useState(null) // address id | 'new' | null
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const blank = () => ({
    id: '',
    title: '',
    fullName: customer.name || '',
    phone: customer.phone || customer.mobile || '',
    address: '',
    city: '',
    isDefault: list.length === 0,
  })
  const setD = (k, v) => setDraft((d) => ({ ...d, [k]: v }))

  const persist = async (next) => {
    setBusy(true)
    setError('')
    try {
      const updated = await accountApi.saveAddresses(next)
      setList(Array.isArray(updated.addresses) ? updated.addresses : [])
      onSaved(updated)
      setEditing(null)
      setDraft(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const startAdd = () => {
    setError('')
    setDraft(blank())
    setEditing('new')
  }
  const startEdit = (a) => {
    setError('')
    setDraft({ ...a })
    setEditing(a.id)
  }
  const remove = (id) => persist(list.filter((a) => a.id !== id))
  const makeDefault = (id) => persist(list.map((a) => ({ ...a, isDefault: a.id === id })))

  const saveDraft = (e) => {
    e.preventDefault()
    if (!draft.address.trim()) {
      setError('Please enter the address.')
      return
    }
    const id = draft.id || 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const entry = { ...draft, id }
    const exists = list.some((a) => a.id === id)
    let next = exists ? list.map((a) => (a.id === id ? entry : a)) : [...list, entry]
    if (entry.isDefault) next = next.map((a) => ({ ...a, isDefault: a.id === id }))
    else if (!next.some((a) => a.isDefault) && next.length) next = next.map((a, i) => ({ ...a, isDefault: i === 0 }))
    persist(next)
  }

  return (
    <div className="mt-6 rounded-2xl border border-as-ink/10 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-as-ink">Saved addresses</h2>
        {editing !== 'new' && (
          <button onClick={startAdd} className="inline-flex items-center gap-1.5 text-sm font-medium text-as-red hover:opacity-80">
            <Icon name="plus" className="h-4 w-4" /> Add address
          </button>
        )}
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {list.length === 0 && editing == null && (
        <p className="mt-2 text-sm text-as-ink/50">
          No saved addresses yet. Add one to check out faster next time.
        </p>
      )}

      {list.length > 0 && (
        <ul className="mt-4 space-y-3">
          {list.map((a) => (
            <li key={a.id} className="rounded-xl border border-as-ink/10 p-4">
              {editing === a.id ? (
                <AddressForm draft={draft} setD={setD} onSave={saveDraft} onCancel={() => { setEditing(null); setDraft(null) }} busy={busy} />
              ) : (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-as-ink">{a.title || 'Address'}</span>
                      {a.isDefault && (
                        <span className="rounded-full bg-as-red/10 px-2 py-0.5 text-[11px] font-semibold text-as-red">Default</span>
                      )}
                    </div>
                    <p className="mt-1 break-words text-sm text-as-ink/70">
                      {[a.fullName, a.phone].filter(Boolean).join(' · ')}
                    </p>
                    <p className="break-words text-sm text-as-ink/70">
                      {[a.address, a.city].filter(Boolean).join(', ')}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      {!a.isDefault && (
                        <button onClick={() => makeDefault(a.id)} disabled={busy} className="font-medium text-as-red hover:opacity-80">
                          Set as default
                        </button>
                      )}
                      <button onClick={() => startEdit(a)} className="text-as-ink/60 hover:text-as-ink">Edit</button>
                      <button onClick={() => remove(a.id)} disabled={busy} className="text-as-ink/60 hover:text-red-600">Delete</button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing === 'new' && (
        <div className="mt-4 rounded-xl border border-as-ink/10 p-4">
          <AddressForm draft={draft} setD={setD} onSave={saveDraft} onCancel={() => { setEditing(null); setDraft(null) }} busy={busy} />
        </div>
      )}
    </div>
  )
}

function AddressForm({ draft, setD, onSave, onCancel, busy }) {
  return (
    <form onSubmit={onSave} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Label" hint="e.g. Home, Office">
          <input value={draft.title} onChange={(e) => setD('title', e.target.value)} className={inputCls} placeholder="Home" />
        </Field>
        <Field label="Full name">
          <input value={draft.fullName} onChange={(e) => setD('fullName', e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Phone">
          <input value={draft.phone} onChange={(e) => setD('phone', e.target.value)} className={inputCls} placeholder="70 123 456" />
        </Field>
        <Field label="City / area">
          <input value={draft.city} onChange={(e) => setD('city', e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Address">
        <input value={draft.address} onChange={(e) => setD('address', e.target.value)} className={inputCls} placeholder="Street, building, floor…" required />
      </Field>
      <label className="flex items-center gap-2 text-sm text-as-ink/70">
        <input type="checkbox" checked={draft.isDefault} onChange={(e) => setD('isDefault', e.target.checked)} className="h-4 w-4 accent-as-red" />
        Use as my default address
      </label>
      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={busy} className="pill px-6">{busy ? 'Saving…' : 'Save address'}</button>
        <button type="button" onClick={onCancel} className="text-sm text-as-ink/50 hover:text-as-ink">Cancel</button>
      </div>
    </form>
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
