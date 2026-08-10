'use client'

// AS Points — the customer's balance, the redeem button, and the full history.
//
// Redeeming is always a deliberate tap: nothing is ever spent for the customer,
// which is why the balance and the "Redeem" panel are separate things on this
// page. What redeeming produces is a reward you pick at checkout, so the copy
// says exactly that rather than implying the money comes off automatically.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon.jsx'
import { useAccount, accountApi } from '@/lib/account'
import { money } from '@/lib/orders'

const num = (n) => Number(n || 0).toLocaleString()
const when = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export default function PointsPage() {
  const { customer, loading } = useAccount()
  const router = useRouter()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [blocks, setBlocks] = useState(1)
  const [error, setError] = useState('')
  const [won, setWon] = useState(null)

  useEffect(() => {
    if (!loading && !customer) router.replace('/login?next=/account/points')
  }, [loading, customer, router])

  const load = () =>
    accountApi
      .loyalty()
      .then((d) => {
        setData(d)
        setBlocks((b) => Math.min(Math.max(1, b), Math.max(1, d.blocks || 1)))
      })
      .catch(() => setData({ enabled: false }))

  useEffect(() => {
    if (customer) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer])

  if (loading || !customer || !data) {
    return (
      <section className="bg-white pt-28 sm:pt-32">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center text-as-ink/40">Loading…</div>
      </section>
    )
  }

  const redeem = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await accountApi.redeemPoints(blocks)
      setWon(res.reward)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const block = Number(data.redeemBlock || 1000)
  const value = Number(data.redeemValue || 0)
  const balance = Number(data.balance || 0)
  const max = Number(data.blocks || 0)
  const toGo = Math.max(0, block - (balance % block || 0))
  const progress = Math.min(100, block > 0 ? ((balance % block) / block) * 100 : 0)

  return (
    <section className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="mx-auto w-full max-w-2xl px-6">
        <Link href="/account" className="inline-flex items-center gap-1 text-sm text-as-ink/50 hover:text-as-ink">
          <Icon name="chevronLeft" className="h-4 w-4" /> Account
        </Link>

        <h1 className="mt-4 text-3xl font-semibold tracking-apple text-as-ink sm:text-4xl">
          {data.title || 'AS Points'}
        </h1>
        {data.subtitle && <p className="mt-1 text-as-ink/55">{data.subtitle}</p>}

        {!data.enabled ? (
          <div className="mt-8 rounded-2xl border border-as-ink/10 p-6 text-as-ink/60">
            The points programme isn’t running at the moment. Any points you’ve already collected are safe on
            your account.
          </div>
        ) : null}

        {/* Balance */}
        <div className="mt-8 overflow-hidden rounded-3xl bg-as-ink p-8 text-white">
          <p className="text-sm font-medium uppercase tracking-wide text-white/50">Your balance</p>
          <p className="mt-1 text-5xl font-semibold tracking-apple">{num(balance)}</p>
          <p className="mt-1 text-white/60">points</p>

          {/* Progress to the next redeemable block — the single most useful
              thing on the page, so it sits with the number it explains. */}
          {max < 1 && (
            <div className="mt-6">
              <div className="h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-as-red transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-sm text-white/70">
                {num(toGo)} more points until your next {money(value)} reward.
              </p>
            </div>
          )}

          {Number(data.pending) > 0 && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">
              <Icon name="refresh" className="h-4 w-4" />
              {num(data.pending)} points on the way from orders in progress
            </p>
          )}
        </div>

        {/* Redeem */}
        {data.enabled && (
          <div className="mt-6 rounded-2xl border border-as-ink/10 p-6">
            <h2 className="text-lg font-semibold text-as-ink">Redeem your points</h2>
            <p className="mt-1 text-sm text-as-ink/55">
              Every {num(block)} points is worth {money(value)} off your next order. Redeeming turns them into a
              reward you choose at checkout — it’s up to you when to spend it.
            </p>

            {won && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-800">
                  {money(won.value)} reward added to your account
                </p>
                <p className="mt-0.5 text-sm text-emerald-700">
                  Code <span className="font-mono font-semibold">{won.code}</span>
                  {won.expiresAt ? ` · valid until ${when(won.expiresAt)}` : ''}. Pick it at checkout to use it.
                </p>
              </div>
            )}

            {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            {max < 1 ? (
              <p className="mt-4 rounded-xl bg-as-ink/4 px-4 py-3 text-sm text-as-ink/60">
                You need at least {num(block)} points to redeem. {num(toGo)} to go.
              </p>
            ) : (
              <div className="mt-5 flex flex-wrap items-center gap-4">
                {max > 1 && (
                  <div className="flex items-center gap-3 rounded-full border border-as-ink/15 px-2 py-1">
                    <button
                      onClick={() => setBlocks((b) => Math.max(1, b - 1))}
                      disabled={blocks <= 1}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-as-ink/70 hover:bg-as-ink/5 disabled:opacity-30"
                      aria-label="Fewer points"
                    >
                      <Icon name="minus" className="h-4 w-4" />
                    </button>
                    <span className="min-w-[5.5rem] text-center text-sm font-semibold text-as-ink">
                      {num(blocks * block)} pts
                    </span>
                    <button
                      onClick={() => setBlocks((b) => Math.min(max, b + 1))}
                      disabled={blocks >= max}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-as-ink/70 hover:bg-as-ink/5 disabled:opacity-30"
                      aria-label="More points"
                    >
                      <Icon name="plus" className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <button onClick={redeem} disabled={busy} className="pill px-8">
                  {busy ? 'Redeeming…' : `Redeem for ${money(blocks * value)}`}
                </button>
              </div>
            )}

            {data.minOrder > 0 && max >= 1 && (
              <p className="mt-3 text-xs text-as-ink/45">
                Rewards apply to orders of {money(data.minOrder)} or more.
              </p>
            )}
          </div>
        )}

        {/* How it works */}
        {(data.intro || (data.terms || []).length > 0) && (
          <div className="mt-6 rounded-2xl border border-as-ink/10 p-6">
            <h2 className="text-lg font-semibold text-as-ink">How it works</h2>
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
          <h2 className="text-lg font-semibold text-as-ink">Points history</h2>
          {(data.history || []).length === 0 ? (
            <p className="mt-2 text-sm text-as-ink/50">
              Nothing yet. Points land on your account once your orders are delivered.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-as-ink/8">
              {data.history.map((e) => (
                <li key={e.id} className="flex items-center gap-4 py-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      e.points > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-as-red/10 text-as-red'
                    }`}
                  >
                    <Icon name={e.points > 0 ? 'plus' : 'star'} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-as-ink">{e.description || 'Points'}</p>
                    <p className="text-xs text-as-ink/45">
                      {when(e.createdAt)}
                      {e.voucherCode ? ` · ${e.voucherCode}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-semibold ${e.points > 0 ? 'text-emerald-600' : 'text-as-ink/60'}`}
                  >
                    {e.points > 0 ? '+' : ''}
                    {num(e.points)}
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
