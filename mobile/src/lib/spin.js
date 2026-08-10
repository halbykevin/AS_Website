// Daily Spin — the app's client for the wheel and the rewards it hands out.
//
// The server owns every decision here: whether the wheel is on, whether this
// customer may spin, and which slice they land on. The screen's job is to draw
// the result, never to compute it. That means no local "next spin" timer that
// could be gamed by changing the device clock — the cooldown always comes from
// `nextSpinAt` in the API's answer.

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

export const spinApi = {
  // The wheel + this customer's cooldown. Works signed out, so the screen can
  // show the real prizes behind the sign-in prompt.
  get: () => req('/api/spin'),
  spin: () => req('/api/spin', { method: 'POST' }),
  // Pass the cart subtotal and each reward comes back with `eligible` and the
  // exact `discount` it is worth — the rules stay on the server.
  vouchers: subtotal => req(`/api/vouchers${subtotal > 0 ? `?subtotal=${subtotal}` : ''}`)
};

// `signedIn` is part of the key: signing in or out has to re-fetch, because the
// cooldown and the sign-in gate both hang off it.
export function useSpin(signedIn) {
  return useQuery({
    queryKey: ['spin', signedIn ? 'in' : 'out'],
    queryFn: spinApi.get,
    staleTime: 30 * 1000,
    retry: 1
  });
}

export function useSpinMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: spinApi.spin,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spin'] });
      qc.invalidateQueries({ queryKey: ['vouchers'] });
    }
  });
}

export function useVouchers(subtotal = 0, enabled = true) {
  // The cart total is normalised once and used for both the cache key and the
  // request, so two bags that differ by cents can't share one cached answer —
  // the discount a reward is worth depends on the exact subtotal.
  const cart = Math.round((Number(subtotal) || 0) * 100) / 100;
  return useQuery({
    queryKey: ['vouchers', cart],
    queryFn: () => spinApi.vouchers(cart),
    enabled,
    staleTime: 30 * 1000
  });
}

// --- display helpers -------------------------------------------------------

// One line describing what a reward is worth. Mirrors prizeWorth() in the admin
// so staff and customers read the same wording.
export function rewardWorth(v) {
  if (!v) return '';
  if (v.type === 'percent') {
    return `${Number(v.value)}% off${Number(v.maxDiscount) > 0 ? ` (up to $${Number(v.maxDiscount)})` : ''}`;
  }
  if (v.type === 'amount') return `$${Number(v.value)} off`;
  if (v.type === 'free_delivery') return 'Free delivery';
  if (v.type === 'gift') return 'A gift from AS';
  return '';
}

// "in 3h 20m" — the wait until the next spin, from the server's timestamp.
export function untilLabel(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const mins = Math.ceil(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d} day${d > 1 ? 's' : ''}`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export const STATUS_LABEL = {
  active: 'Ready to use',
  used: 'Used',
  expired: 'Expired',
  cancelled: 'No longer valid',
  fulfilled: 'Claimed'
};
