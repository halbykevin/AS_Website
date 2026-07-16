'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount, accountApi } from '@/lib/account'
import { AuthShell, Field, inputCls } from '@/components/AccountUI.jsx'

const RESEND_SECONDS = 30

// Per-channel copy + input wiring, so the steps below stay channel-agnostic.
const CHANNELS = {
  email: {
    label: 'Email',
    field: 'Email address',
    placeholder: 'you@example.com',
    type: 'email',
    autoComplete: 'email',
    sentTo: (id) => `We emailed a 6-digit code to ${id}.`,
    ask: 'Enter your email and we’ll send you a 6-digit sign-in code.',
    linkAsk: 'Add your email address so you can sign in either way.',
  },
  whatsapp: {
    label: 'WhatsApp',
    field: 'Mobile number',
    placeholder: '70 123 456',
    type: 'tel',
    autoComplete: 'tel',
    sentTo: (id) => `We sent a 6-digit code on WhatsApp to ${id}.`,
    ask: 'Enter your mobile and we’ll send you a 6-digit sign-in code on WhatsApp.',
    linkAsk: 'Add your WhatsApp number so you can sign in either way.',
  },
}

function LoginInner() {
  const { loginWithOtp, linkChannel } = useAccount()
  const router = useRouter()
  const next = useSearchParams().get('next') || '/account'

  // Which channels the API can actually deliver on. WhatsApp only appears once
  // the Cloud API is configured server-side, so we never offer a dead option.
  const [channels, setChannels] = useState(['email'])
  const [channel, setChannel] = useState('email')

  const [step, setStep] = useState('identifier') // identifier | code | link | linkCode
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  // The channel we're offering to link after a successful sign-in.
  const [pending, setPending] = useState(null)
  const [linkId, setLinkId] = useState('')
  const codeRef = useRef(null)

  useEffect(() => {
    accountApi
      .otpChannels()
      .then((r) => setChannels(r.channels?.length ? r.channels : ['email']))
      .catch(() => {}) // offline: email-only is the safe default
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const toCode = (nextStep) => {
    setStep(nextStep)
    setCode('')
    setCooldown(RESEND_SECONDS)
    setTimeout(() => codeRef.current?.focus(), 50)
  }

  const requestCode = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      await accountApi.requestOtp(channel, identifier)
      toCode('code')
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
      const { linkChannel: offer } = await loginWithOtp(channel, identifier, code)
      // Signed in. If they've only ever given us one way to reach them, offer to
      // add the other — it keeps one account instead of two.
      if (offer && CHANNELS[offer]) {
        setPending(offer)
        setLinkId('')
        setStep('link')
        setBusy(false)
        return
      }
      router.push(next)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const requestLink = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      await accountApi.requestLink(pending, linkId)
      toCode('linkCode')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const verifyLink = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await linkChannel(pending, linkId, code)
      router.push(next)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const cfg = CHANNELS[channel]
  const linkCfg = CHANNELS[pending] || CHANNELS.email
  const linking = step === 'link' || step === 'linkCode'
  const onCode = step === 'code' || step === 'linkCode'

  const subtitle = {
    identifier: cfg.ask,
    code: cfg.sentTo(identifier),
    link: linkCfg.linkAsk,
    linkCode: linkCfg.sentTo(linkId),
  }[step]

  return (
    <AuthShell
      title={linking ? 'One last thing' : 'Sign in'}
      subtitle={subtitle}
      footer={
        onCode ? (
          <button
            type="button"
            disabled={cooldown > 0 || busy}
            onClick={step === 'linkCode' ? requestLink : requestCode}
            className="font-medium text-as-red hover:underline disabled:cursor-default disabled:text-as-ink/35 disabled:no-underline"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        ) : step === 'identifier' ? (
          <>No password needed — we send you a one-time code each time you sign in.</>
        ) : null
      }
    >
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {step === 'identifier' && (
        <form onSubmit={requestCode} className="space-y-4">
          {/* Channel picker — only worth showing when there's a choice. */}
          {channels.length > 1 && (
            <div className="flex rounded-full border border-as-ink/15 p-0.5">
              {channels.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setChannel(c)
                    setIdentifier('')
                    setError('')
                  }}
                  aria-pressed={channel === c}
                  className={`h-9 flex-1 rounded-full text-sm font-semibold transition ${
                    channel === c ? 'bg-as-red text-white shadow-sm' : 'text-as-ink/50 hover:text-as-ink'
                  }`}
                >
                  {CHANNELS[c].label}
                </button>
              ))}
            </div>
          )}
          <Field label={cfg.field}>
            <input
              key={channel}
              type={cfg.type}
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className={inputCls}
              placeholder={cfg.placeholder}
              autoComplete={cfg.autoComplete}
              autoFocus
            />
          </Field>
          <button type="submit" disabled={busy} className="pill w-full justify-center">
            {busy ? 'Sending code…' : 'Send code'}
          </button>
        </form>
      )}

      {step === 'link' && (
        <form onSubmit={requestLink} className="space-y-4">
          <Field label={linkCfg.field}>
            <input
              type={linkCfg.type}
              required
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              className={inputCls}
              placeholder={linkCfg.placeholder}
              autoComplete={linkCfg.autoComplete}
              autoFocus
            />
          </Field>
          <button type="submit" disabled={busy} className="pill w-full justify-center">
            {busy ? 'Sending code…' : 'Send code'}
          </button>
          <button
            type="button"
            onClick={() => router.push(next)}
            className="block w-full text-center text-sm text-as-ink/45 hover:text-as-red"
          >
            Skip for now
          </button>
        </form>
      )}

      {onCode && (
        <form onSubmit={step === 'linkCode' ? verifyLink : verify} className="space-y-4">
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
          <button type="submit" disabled={busy || code.length < 6} className="pill w-full justify-center">
            {busy ? 'Verifying…' : step === 'linkCode' ? 'Link and continue' : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep(step === 'linkCode' ? 'link' : 'identifier')
              setError('')
            }}
            className="block w-full text-center text-sm text-as-ink/45 hover:text-as-red"
          >
            Use a different {(step === 'linkCode' ? linkCfg : cfg).field.toLowerCase()}
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
