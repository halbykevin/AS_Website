'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount, accountApi } from '@/lib/account'
import { AppleButton, AuthShell, CodeForm, EmailButton, Field, GoogleButton, inputCls } from '@/components/AccountUI.jsx'

const RESEND_SECONDS = 30

// Apple's button is designed and ready (see AppleButton) but has no flow behind
// it yet, so it stays off: a live button carrying Apple's mark has to actually
// be Sign in with Apple. Turn this on only together with the real integration —
// it should then follow the API's method list, like Google's does.
const APPLE_READY = false

function LoginInner() {
  const { loginWithOtp } = useAccount()
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/account'

  // Google only appears once the API says it's configured, so a dead button is
  // never offered. Errors on the way back from Google land here as ?error=google.
  const [google, setGoogle] = useState(false)
  // The page opens as a choice of methods; the email field only appears once
  // that's the method you picked.
  const [step, setStep] = useState('choose') // choose | email | code
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState(params.get('error') === 'google' ? 'Google sign-in didn’t complete. Please try again.' : '')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef(null)

  useEffect(() => {
    accountApi
      .authMethods()
      .then((r) => setGoogle(Boolean(r.google)))
      .catch(() => {}) // offline: email code still works
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
      await accountApi.requestOtp('email', email)
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
      await loginWithOtp('email', email, code)
      router.push(next)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const subtitle = {
    choose: 'Use your Google account, or we’ll email you a one-time code.',
    email: 'We’ll email you a 6-digit code — no password to remember.',
    code: `We emailed a 6-digit code to ${email}.`,
  }[step]

  return (
    <AuthShell
      title="Sign in"
      subtitle={subtitle}
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
            New to AS Store?{' '}
            <Link
              href={`/register${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`}
              className="font-medium text-as-red hover:underline"
            >
              Create an account
            </Link>
          </>
        )
      }
    >
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {step === 'choose' && (
        <div className="space-y-3">
          {google && <GoogleButton next={next} />}
          {APPLE_READY && <AppleButton />}
          <EmailButton onClick={() => setStep('email')} />
        </div>
      )}

      {step === 'email' && (
        <form onSubmit={requestCode} className="space-y-4">
          <Field label="Email address">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
            />
          </Field>
          <button type="submit" disabled={busy} className="pill w-full justify-center">
            {busy ? 'Sending code…' : 'Email me a code'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('choose')
              setError('')
            }}
            className="block w-full text-center text-sm text-as-ink/45 hover:text-as-red"
          >
            Back
          </button>
        </form>
      )}

      {step === 'code' && (
        <CodeForm
          inputRef={codeRef}
          value={code}
          onChange={setCode}
          onSubmit={verify}
          busy={busy}
          submitLabel="Sign in"
          onBack={() => {
            setStep('email')
            setError('')
          }}
          backLabel="Use a different email address"
        />
      )}
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
