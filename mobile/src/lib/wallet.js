// AS Wallet — the app's client for store credit.
//
// Every number here is the server's: the balance is the sum of a ledger it
// owns, and spending is something checkout asks for rather than something the
// app subtracts. The screens render what comes back and nothing else, so two
// devices signed into the same account can never disagree about what is left.

import { useQuery } from '@tanstack/react-query';
import { STORE_API_URL } from '@/src/config/env';
import { getCustomerToken } from './account';
import { noteAuthFailure } from './session';

const API = STORE_API_URL;

async function req(path) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getCustomerToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    noteAuthFailure(res.status, Boolean(token));
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const walletApi = {
  // The rules + this customer's standing. Works signed out, returning the rules
  // with a zero balance so a screen can explain the deal first.
  // `total` asks the server how much of the balance this order could take.
  get: (total = 0) => req(`/api/wallet${total > 0 ? `?total=${encodeURIComponent(total)}` : ''}`)
};

// `signedIn` is part of the key: signing in or out has to re-fetch, because the
// balance and the history both hang off it. `total` is too — it changes the
// `spendable` figure the checkout renders.
export function useWallet(signedIn, total = 0) {
  const rounded = Math.round((Number(total) || 0) * 100) / 100;
  return useQuery({
    queryKey: ['wallet', signedIn ? 'in' : 'out', rounded],
    queryFn: () => walletApi.get(rounded),
    staleTime: 30 * 1000,
    retry: 1
  });
}

// --- earn estimates --------------------------------------------------------
//
// What a shopper is told they will get back, before the order exists. Mirrors
// `walletEarnFor()` in as_store/server/src/wallet.js exactly — a percentage of
// the money that buys goods, after item discounts, rounded down to the cent —
// so the promise made on a product page is the one the server keeps. Delivery
// and VAT are not part of the basis and must never be passed in.

export const creditFor = (amount, rules) => {
  if (!rules?.enabled) return 0;
  const pct = Number(rules.earnPercent) || 0;
  return Math.max(0, Math.floor((Number(amount) || 0) * pct) / 100);
};

// The most of one order the wallet may cover, given the rules. A mirror of
// `spendableOn()` on the server, which is what actually decides — this only
// exists so the checkout can show the figure before it asks.
export const spendableOn = (total, balance, rules) => {
  if (!rules?.enabled) return 0;
  const t = round(total);
  if (t <= 0 || t < round(rules.minOrder)) return 0;
  const pct = Math.min(100, Math.max(0, Number(rules.maxPercent) || 0));
  return Math.max(0, Math.min(round(balance), round((t * pct) / 100), t));
};

const round = v => Math.round((Number(v) || 0) * 100) / 100;

// --- display helpers -------------------------------------------------------

export const KIND_ICON = {
  earn: 'plus',
  revoke: 'minus',
  spend: 'bag',
  refund: 'refresh',
  adjust: 'star'
};

// What a spend of `amount` would put in the wallet, and therefore what an
// "almost free next order" line can honestly promise.
export const nextOrderWorth = (balance, credit) => round(Number(balance || 0) + Number(credit || 0));
