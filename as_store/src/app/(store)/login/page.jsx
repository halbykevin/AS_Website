'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount, accountApi } from '@/lib/account'
import { AuthShell, Field, inputCls } from '@/components/AccountUI.jsx'

const RESEND_SECONDS = 30

function LoginInner() {
  const { loginWithOtp } = useAccount()
  const router = useRouter()
  const next = useSearchParams().get('next') || '/account'

  const [step, setStep] = useState('mobile') // 'mobile' | 'code'
  const [mobile, setMobile] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef(null)

  // Resend countdown.
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
      const r = await accountApi.requestOtp(mobile)
      setDevCode(r.devCode || '')
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
      await loginWithOtp(mobile, code)
      router.push(next)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle={
        step === 'mobile'
          ? 'Enter your mobile number and we’ll text you a sign-in code.'
          : `We sent a 6-digit code to ${mobile}.`
      }
      footer={
        step === 'mobile' ? (
          <>No account needed — one is created with your mobile number on your first order.</>
        ) : (
          <button
            type="button"
            disabled={cooldown > 0 || busy}
            onClick={requestCode}
            className="font-medium text-as-red hover:underline disabled:cursor-default disabled:text-as-ink/35 disabled:no-underline"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        )
      }
    >
      {step === 'mobile' ? (
        <form onSubmit={requestCode} className="space-y-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <Field label="Mobile number">
            <input
              type="tel"
              required
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className={inputCls}
              placeholder="70 123 456"
              autoComplete="tel"
              autoFocus
            />
          </Field>
          <button type="submit" disabled={busy} className="pill w-full justify-center">
            {busy ? 'Sending code…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <Field label="6-digit code">
            <input
              ref={codeRef}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${inputCls} text-center text-xl tracking-[0.4em]`}
              placeholder="••••••"
              autoComplete="one-time-code"
            />
          </Field>
          {devCode && (
            <p className="text-center text-xs text-as-ink/40">
              Dev mode — your code is <span className="font-semibold">{devCode}</span>
            </p>
          )}
          <button type="submit" disabled={busy || code.length < 6} className="pill w-full justify-center">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('mobile')
              setError('')
            }}
            className="block w-full text-center text-sm text-as-ink/45 hover:text-as-red"
          >
            Use a different number
          </button>
        </form>
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
