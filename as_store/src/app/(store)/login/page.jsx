'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from '@/lib/account'
import { AuthShell, Field, inputCls } from '@/components/AccountUI.jsx'

function LoginInner() {
  const { login } = useAccount()
  const router = useRouter()
  const next = useSearchParams().get('next') || '/account'
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(form.email, form.password)
      router.push(next)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const registerHref = next !== '/account' ? `/register?next=${encodeURIComponent(next)}` : '/register'

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back to AS Store."
      footer={
        <>
          New here?{' '}
          <Link href={registerHref} className="font-medium text-as-red hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <Field label="Email">
          <input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} autoComplete="email" />
        </Field>
        <Field label="Password">
          <input type="password" required value={form.password} onChange={(e) => set('password', e.target.value)} className={inputCls} autoComplete="current-password" />
        </Field>
        <button type="submit" disabled={busy} className="pill w-full justify-center">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}
