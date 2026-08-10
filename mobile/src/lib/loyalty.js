// AS Points — the app's client for the loyalty programme.
//
// Like the spin, every number here is the server's: the balance is the sum of a
// ledger it owns, and redeeming is a request, not a local subtraction. The
// screen renders what comes back and nothing else, so two devices signed into
// the same account can never disagree about what is left.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STORE_API_URL } from '@/src/config/env';
import { getCustomerToken } from './account';
import { noteAuthFailure } from './session';

const API = STORE_API_URL;

async function req(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getCustomerToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
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

export const loyaltyApi = {
  // The programme + this customer's standing. Works signed out, returning the
  // rules with a zero balance so the screen can explain the deal first.
  get: () => req('/api/loyalty'),
  redeem: (blocks = 1) => req('/api/loyalty/redeem', { method: 'POST', body: { blocks } })
};

// `signedIn` is part of the key: signing in or out has to re-fetch, because the
// balance and the history both hang off it.
export function useLoyalty(signedIn) {
  return useQuery({
    queryKey: ['loyalty', signedIn ? 'in' : 'out'],
    queryFn: loyaltyApi.get,
    staleTime: 30 * 1000,
    retry: 1
  });
}

export function useRedeemPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: blocks => loyaltyApi.redeem(blocks),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty'] });
      // The reward it minted lands in My rewards and the checkout picker.
      qc.invalidateQueries({ queryKey: ['vouchers'] });
    }
  });
}

// --- display helpers -------------------------------------------------------

export const points = n => Number(n || 0).toLocaleString();

export const KIND_ICON = {
  earn: 'plus',
  revoke: 'minus',
  redeem: 'ticket',
  adjust: 'star'
};

// How far through the current block a balance is, 0–1. Drives the progress bar
// that answers the only question a customer under the threshold has.
export function blockProgress(balance, block) {
  const size = Math.max(1, Number(block) || 1);
  const within = Number(balance || 0) % size;
  return Math.min(1, Math.max(0, within / size));
}

// Points still needed for the next reward.
export const pointsToGo = (balance, block) => {
  const size = Math.max(1, Number(block) || 1);
  const within = Number(balance || 0) % size;
  return size - within;
};
