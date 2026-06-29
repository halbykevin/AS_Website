'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from '@/lib/account'
import { AuthShell, Field, inputCls } from '@/components/AccountUI.jsx'

function RegisterInner() {
  const { register } = useAccount()
  const router = useRouter()
  const next = useSearchParams().get('next') || '/account'
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', address: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await register(form)
      router.push(next)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const loginHref = next !== '/account' ? `/login?next=${encodeURIComponent(next)}` : '/login'

  return (
    <AuthShell
      title="Create account"
      subtitle="Order faster and track your deliveries."
      footer={
        <>
          Already have an account?{' '}
          <Link href={loginHref} className="font-medium text-as-red hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <Field label="Full name">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} autoComplete="name" />
        </Field>
        <Field label="Email">
          <input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 6 characters.">
          <input type="password" required minLength={6} value={form.password} onChange={(e) => set('password', e.target.value)} className={inputCls} autoComplete="new-password" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} autoComplete="tel" placeholder="+961 …" />
          </Field>
          <Field label="Address">
            <input value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} autoComplete="street-address" />
          </Field>
        </div>
        <button type="submit" disabled={busy} className="pill w-full justify-center">
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterInner />
    </Suspense>
  )
}
