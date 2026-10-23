'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { payOnline } from '@/lib/bookings'

/** "Pay online" on a reservation: opens Whish for exactly what is owed. */
export function PayOnlineButton({ code, token, label }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pay() {
    setBusy(true)
    setError('')
    try {
      const { collectUrl } = await payOnline(code, token)
      window.location.assign(collectUrl)
    } catch (err) {
      setBusy(false)
      setError(err.message)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="w-full rounded-full bg-as-red px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light disabled:opacity-60 sm:w-auto"
      >
        {busy ? 'Opening payment…' : label}
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-as-red">{error}</p>}
    </div>
  )
}

/**
 * Back from Whish with a success, but the booking still reads reserved: their
 * callback can land a moment after the visitor does. Re-read the page a few
 * times (the API asks Whish directly on every read) before leaving it as is.
 */
export function AwaitPayment() {
  const router = useRouter()
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (tries >= 8) return
    const t = setTimeout(() => {
      router.refresh()
      setTries((n) => n + 1)
    }, 3000)
    return () => clearTimeout(t)
  }, [tries, router])
  return (
    <p className="mt-2 text-sm font-semibold text-as-charcoal/70">
      {tries < 8 ? 'Confirming your payment with Whish…' : 'We haven’t had Whish’s confirmation yet — this page updates once we do.'}
    </p>
  )
}
