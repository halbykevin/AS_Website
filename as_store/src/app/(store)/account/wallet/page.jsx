'use client'

// AS Wallet — the customer's balance and the full history.
//
// What replaced the AS Points page, and the reason the redeem panel is gone:
// there is nothing to trade any more. The balance is money, so the only job
// here is to show it honestly and say where it gets spent. Every figure comes
// from the server — the balance is the sum of a ledger it owns, and this page
// never does arithmetic on it.

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon.jsx'
import { useAccount } from '@/lib/account'
import { useWallet } from '@/lib/wallet'
import { money } from '@/lib/orders'

const when = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

// "Spend $1,000, get $50 back" — the deal in the shape people actually shop in,
// derived from the percentage rather than stated twice in the CMS.
const dealLine = (rules) => {
  const pct = Number(rules?.earnPercent) || 0
  return pct ? `Spend ${money(1000)}, get ${money((1000 * pct) / 100)} back in your wallet.` : ''
}

export default function WalletPage() {
  const { customer, loading } = useAccount()
  const router = useRouter()
  // The one shared ['wallet'] query — the account card and the checkout estimate
  // read the same cached answer.
  const { data, isError } = useWallet()

  useEffect(() => {
    if (!loading && !customer) router.replace('/login?next=/account/wallet')
  }, [loading, customer, router])

  if (loading || !customer || !data) {
    return (
      <section className="bg-white pt-28 sm:pt-32">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center text-as-ink/40">
          {/* Never leave it spinning on a failed fetch — a balance that won't
              load is exactly the moment a customer needs to be told why. */}
          {isError ? 'We couldn’t load your wallet just now. Please try again in a moment.' : 'Loading…'}
        </div>
      </section>
    )
  }

  const balance = Number(data.balance || 0)
  const history = data.history || []

  return (
    <section className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="mx-auto w-full max-w-2xl px-6">
        <Link href="/account" className="inline-flex items-center gap-1 text-sm text-as-ink/50 hover:text-as-ink">
          <Icon name="chevronLeft" className="h-4 w-4" /> Account
        </Link>

        <h1 className="mt-4 text-3xl font-semibold tracking-apple text-as-ink sm:text-4xl">
          {data.title || 'AS Wallet'}
        </h1>
        {data.subtitle && <p className="mt-1 text-as-ink/55">{data.subtitle}</p>}

        {!data.enabled ? (
          <div className="mt-8 rounded-2xl border border-as-ink/10 p-6 text-as-ink/60">
            The wallet isn’t running at the moment. Any credit you’ve already collected is safe on your account.
          </div>
        ) : null}

        {/* Balance */}
        <div className="mt-8 overflow-hidden rounded-3xl bg-as-ink p-8 text-white">
          <p className="text-sm font-medium uppercase tracking-wide text-white/50">Your balance</p>
          <p className="mt-1 text-5xl font-semibold tracking-apple">{money(balance)}</p>
          <p className="mt-1 text-white/60">{balance > 0 ? 'ready to spend at checkout' : 'nothing in it yet'}</p>

          {Number(data.pending) > 0 && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">
              <Icon name="refresh" className="h-4 w-4" />
              {money(data.pending)} on the way from orders in progress
            </p>
          )}
        </div>

        {/* Where it gets spent. There is no button here on purpose: the wallet is
            applied at checkout, against a real order. */}
        {data.enabled && (
          <div className="mt-6 rounded-2xl border border-as-ink/10 p-6">
            <h2 className="text-lg font-semibold text-as-ink">Spending your wallet</h2>
            <p className="mt-1 text-sm text-as-ink/55">
              {balance > 0
                ? 'Your balance is offered at checkout — switch it on and it comes straight off the total.'
                : 'Place an order and your credit lands here. It’s then offered at checkout on the next one.'}
              {Number(data.minOrder) > 0 ? ` Orders of ${money(data.minOrder)} or more.` : ''}
              {Number(data.maxPercent) > 0 && Number(data.maxPercent) < 100
                ? ` It can cover up to ${Number(data.maxPercent)}% of an order.`
                : ''}
            </p>
            {balance > 0 && (
              <Link href="/" className="pill mt-5 inline-flex">
                Start shopping
              </Link>
            )}
          </div>
        )}

        {/* How it works */}
        {(data.intro || dealLine(data) || (data.terms || []).length > 0) && (
          <div className="mt-6 rounded-2xl border border-as-ink/10 p-6">
            <h2 className="text-lg font-semibold text-as-ink">How it works</h2>
            {dealLine(data) && <p className="mt-2 text-sm text-as-ink/65">{dealLine(data)}</p>}
            {data.intro && <p className="mt-2 text-sm text-as-ink/65">{data.intro}</p>}
            {(data.terms || []).length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {data.terms.map((t, i) => (
                  <li key={i} className="flex gap-2 text-sm text-as-ink/60">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-as-red" />
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* History */}
        <div className="mt-6 rounded-2xl border border-as-ink/10 p-6">
          <h2 className="text-lg font-semibold text-as-ink">Wallet history</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-as-ink/50">
              Nothing yet. Credit lands on your account once your orders are delivered.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-as-ink/8">
              {history.map((e) => (
                <li key={e.id} className="flex items-center gap-4 py-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      e.amount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-as-red/10 text-as-red'
                    }`}
                  >
                    <Icon name={e.amount > 0 ? 'plus' : 'star'} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-as-ink">{e.description || 'Wallet'}</p>
                    <p className="text-xs text-as-ink/45">{when(e.createdAt)}</p>
                  </div>
                  <span className={`shrink-0 font-semibold ${e.amount > 0 ? 'text-emerald-600' : 'text-as-ink/60'}`}>
                    {e.amount > 0 ? '+' : '−'}
                    {money(Math.abs(e.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
