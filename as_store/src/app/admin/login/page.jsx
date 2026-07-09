'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminApi, setToken } from '@/lib/adminApi'
import { Button, Field, Input } from '@/components/admin/ui.jsx'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token } = await adminApi.login(email, password)
      setToken(token)
      router.replace('/admin')
    } catch (err) {
      setError(err.message || 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-as-ink px-4">
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-as-red/30 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-as-red-light/20 blur-[120px]" />

      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center">
          <span className="rounded-lg bg-as-ink px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/as-store-logo.webp" alt="AS Store" width={300} height={200} className="h-7 w-auto" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-as-ink">AS Store CMS</h1>
          <p className="mt-1 text-sm text-as-ink/50">Sign in to manage the store</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
