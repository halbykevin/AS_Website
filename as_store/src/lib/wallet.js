'use client'

// AS Wallet on the storefront — the rules, and the arithmetic for showing a
// shopper what an order gives back *before* they place it.
//
// The estimate here must agree with what the server will actually credit, so
// `creditFor` mirrors `walletEarnFor()` in server/src/wallet.js exactly: a
// percentage of the money that buys goods, after item discounts, rounded down
// to the cent. Delivery and VAT are not part of it and must never be passed in.

import { useQuery } from '@tanstack/react-query'
import { accountApi } from '@/lib/account'

// One shared query for every wallet surface on the page — the product page, the
// checkout summary and the account card all read the same cached answer rather
// than each asking. Works signed out (rules only, zero balance).
//
// `total` is part of the key because it changes the answer: the server returns
// how much of the balance *this* order could take, so the client never has to
// re-implement the money rules.
export function useWallet(total = 0) {
  const rounded = round(total)
  return useQuery({
    queryKey: ['wallet', rounded],
    queryFn: () => accountApi.wallet(rounded),
    staleTime: 60 * 1000,
    retry: 1,
  })
}

// What an amount of item spend gives back. Returns 0 when the wallet is off, so
// callers can render on the number alone.
export const creditFor = (amount, rules) => {
  if (!rules?.enabled) return 0
  const pct = Number(rules.earnPercent) || 0
  return Math.max(0, Math.floor((Number(amount) || 0) * pct) / 100)
}

// The most of one order the wallet may cover. A mirror of `spendableOn()` on the
// server, which is what actually decides — this only exists so the checkout can
// show the figure before it asks for it.
export const spendableOn = (total, balance, rules) => {
  if (!rules?.enabled) return 0
  const t = round(total)
  if (t <= 0 || t < round(rules.minOrder)) return 0
  const pct = Math.min(100, Math.max(0, Number(rules.maxPercent) || 0))
  return Math.max(0, Math.min(round(balance), round((t * pct) / 100), t))
}

function round(v) {
  return Math.round((Number(v) || 0) * 100) / 100
}
