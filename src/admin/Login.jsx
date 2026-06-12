import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import { Field, TextInput, Button, Banner } from './ui.jsx'

export default function AdminLogin() {
  const { isAuthed, login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (isAuthed) return <Navigate to="/admin" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-as-charcoal/[0.03] px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/ASCompanyLogo.jpg" alt="AS Company" className="mx-auto h-14 w-auto mix-blend-multiply" />
          <h1 className="mt-4 text-xl font-bold text-as-charcoal">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-as-charcoal/55">Sign in to manage the website</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <Banner kind="error">{error}</Banner>
          <Field label="Email">
            <TextInput
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
          </Field>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-as-charcoal/45">
          Uses your PocketBase superuser account.
        </p>
      </div>
    </div>
  )
}
