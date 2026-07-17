'use client'

// Sign up with your details. There's no password: the emailed code is what proves
// the address is yours, so this is the same OTP flow as /login — it just carries
// the details along and the server saves them once the code checks out.

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount, accountApi } from '@/lib/account'
import { AuthShell, CodeForm, Field, GoogleButton, OrDivider, inputCls } from '@/components/AccountUI.jsx'

const RESEND_SECONDS = 30
const EMPTY = { name: '', email: '', mobile: '', address: '' }

function RegisterInner() {
  const { loginWithOtp } = useAccount()
  const router = useRouter()
  const next = useSearchParams().get('next') || '/account'

  const [google, setGoogle] = useState(false)
  const [step, setStep] = useState('details') // details | code
  const [form, setForm] = useState(EMPTY)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  useEffect(() => {
    accountApi
      .authMethods()
      .then((r) => setGoogle(Boolean(r.google)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const requestCode = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      await accountApi.requestOtp('email', form.email)
      setStep('code')
      setCode('')
      setCooldown(RESEND_SECONDS)
      setTimeout(() => codeRef.current?.focus(), 50)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      // The details ride along with the code — the server only keeps them once
      // it has verified this email really is theirs.
      await loginWithOtp('email', form.email, code, {
        name: form.name,
        mobile: form.mobile,
        address: form.address,
      })
      router.push(next)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={step === 'code' ? 'Confirm your email' : 'Create your account'}
      subtitle={
        step === 'code'
          ? `We emailed a 6-digit code to ${form.email}.`
          : 'Your details save you filling them in at checkout.'
      }
      footer={
        step === 'code' ? (
          <button
            type="button"
            disabled={cooldown > 0 || busy}
            onClick={requestCode}
            className="font-medium text-as-red hover:underline disabled:cursor-default disabled:text-as-ink/35 disabled:no-underline"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        ) : (
          <>
            Already have an account?{' '}
            <Link
              href={`/login${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`}
              className="font-medium text-as-red hover:underline"
            >
              Sign in
            </Link>
          </>
        )
      }
    >
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {step === 'details' && (
        <div className="space-y-5">
          {google && (
            <>
              <GoogleButton next={next} label="Sign up with Google" />
              <OrDivider />
            </>
          )}
          <form onSubmit={requestCode} className="space-y-4">
            <Field label="Full name">
              <input
                type="text"
                required
                value={form.name}
                onChange={set('name')}
                className={inputCls}
                placeholder="Your name"
                autoComplete="name"
                autoFocus
              />
            </Field>
            <Field label="Email address" hint="We’ll send your sign-in code here.">
              <input
                type="email"
                required
                value={form.email}
                onChange={set('email')}
                className={inputCls}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>
            <Field label="Mobile number" hint="So we can reach you about your delivery.">
              <input
                type="tel"
                required
                value={form.mobile}
                onChange={set('mobile')}
                className={inputCls}
                placeholder="70 123 456"
                autoComplete="tel"
              />
            </Field>
            <Field label="Delivery address" hint="Optional — you can add it at checkout.">
              <textarea
                rows={3}
                value={form.address}
                onChange={set('address')}
                className={`${inputCls} resize-none`}
                placeholder="Street, building, floor"
                autoComplete="street-address"
              />
            </Field>
            <button type="submit" disabled={busy} className="pill w-full justify-center">
              {busy ? 'Sending code…' : 'Create account'}
            </button>
          </form>
          <p className="text-center text-xs text-as-ink/45">
            No password to remember — we email you a one-time code each time you sign in.
          </p>
        </div>
      )}

      {step === 'code' && (
        <CodeForm
          inputRef={codeRef}
          value={code}
          onChange={setCode}
          onSubmit={verify}
          busy={busy}
          submitLabel="Create account"
          onBack={() => {
            setStep('details')
            setError('')
          }}
          backLabel="Change my details"
        />
      )}
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
