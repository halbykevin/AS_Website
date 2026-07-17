'use client'

// Landing spot for Google sign-in. The API sends the shopper here with the token
// in the URL *fragment* (#token=…), which never reaches a server and so stays out
// of referrers and access logs. We take it, confirm it works, and move on — this
// page is a blink, not a destination.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from '@/lib/account'

export default function GoogleAuthPage() {
  const { adoptToken } = useAccount()
  const router = useRouter()
  const [error, setError] = useState('')
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return // React 18 dev double-effect: only adopt once
    done.current = true

    const params = new URLSearchParams(window.location.hash.slice(1))
    const token = params.get('token')
    const next = params.get('next') || '/account'
    if (!token) {
      router.replace('/login?error=google')
      return
    }

    // Drop the token out of the address bar before anything else can read it.
    window.history.replaceState(null, '', window.location.pathname)
    adoptToken(token)
      .then(() => router.replace(next.startsWith('/') ? next : '/account'))
      .catch(() => setError('We couldn’t finish signing you in.'))
  }, [adoptToken, router])

  return (
    <section className="flex min-h-[60vh] items-center justify-center bg-white px-6 pt-28">
      {error ? (
        <div className="text-center">
          <p className="text-as-ink/70">{error}</p>
          <button onClick={() => router.replace('/login')} className="pill mt-5">
            Back to sign in
          </button>
        </div>
      ) : (
        <p className="text-as-ink/50">Signing you in…</p>
      )}
    </section>
  )
}
