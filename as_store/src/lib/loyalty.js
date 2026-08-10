'use client'

// AS Points on the storefront — the rules, and the arithmetic for showing a
// shopper what an order will earn *before* they place it.
//
// The estimate here must agree with what the server will actually credit, so
// `pointsFor` mirrors `pointsForOrder()` in server/src/loyalty.js exactly:
// earned on the money that buys goods, after item discounts, rounded down.
// Delivery and VAT are not part of it and must never be passed in.

import { useQuery } from '@tanstack/react-query'
import { accountApi } from '@/lib/account'

// One shared query for every points surface on the page — the product tile, the
// checkout summary and the account card all read the same cached answer rather
// than each asking. Works signed out (rules only, zero balance).
export function useLoyalty() {
  return useQuery({
    queryKey: ['loyalty'],
    queryFn: accountApi.loyalty,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}

// What an amount of item spend earns. Returns 0 when the programme is off, so
// callers can render on the number alone.
export const pointsFor = (amount, rules) => {
  if (!rules?.enabled) return 0
  const rate = Number(rules.earnRate) || 0
  return Math.max(0, Math.floor((Number(amount) || 0) * rate))
}

// Whole redeemable blocks in a points figure, and what they are worth. Points
// are only ever spendable a block at a time, so a pro-rata "value" would
// promise money that cannot actually be redeemed.
export const blocksIn = (points, rules) => {
  const block = Math.max(1, Number(rules?.redeemBlock) || 1)
  return Math.floor((Number(points) || 0) / block)
}

export const blocksWorth = (points, rules) =>
  blocksIn(points, rules) * (Number(rules?.redeemValue) || 0)

// Points still needed to finish the current block — the "X more and you can
// redeem" number.
export const pointsToBlock = (points, rules) => {
  const block = Math.max(1, Number(rules?.redeemBlock) || 1)
  return block - ((Number(points) || 0) % block)
}

export const num = (n) => Number(n || 0).toLocaleString()
