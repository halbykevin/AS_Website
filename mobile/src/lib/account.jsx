// Storefront customer accounts — the RN port of the AS Store web account layer.
// A tiny API client (accountApi) + a React context (AccountProvider/useAccount)
// holding the signed-in customer. The token lives in AsyncStorage; because that
// is async, we also keep an in-memory copy so request headers stay synchronous.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { STORE_API_URL } from '@/src/config/env';
import { storage, KEYS } from './storage';

const API = STORE_API_URL;

// In-memory mirror of the persisted token so `req` can attach it synchronously.
let cachedToken = null;
export const getCustomerToken = () => cachedToken;

async function persistToken(t) {
  cachedToken = t;
  await storage.set(KEYS.customerToken, t);
}
async function clearPersistedToken() {
  cachedToken = null;
  await storage.remove(KEYS.customerToken);
}

async function req(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && cachedToken) headers.Authorization = `Bearer ${cachedToken}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const err = new Error(e.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// Google sign-in is a full browser round-trip (app → API → Google → API). We hand
// the API our deep link as `appReturn`, so its callback redirects the token back
// into the app (the browser tab then closes itself) instead of the web storefront.
// See `src/lib/googleAuth.js` for the browser flow that drives this.
export const googleSignInUrl = (next = '/', appReturn = '') =>
  `${API}/api/account/google/start?next=${encodeURIComponent(next)}` +
  (appReturn ? `&appReturn=${encodeURIComponent(appReturn)}` : '');

export const accountApi = {
  authMethods: () => req('/api/account/auth/methods'),
  requestOtp: (channel, identifier) => req('/api/account/otp/request', { method: 'POST', body: { channel, identifier } }),
  verifyOtp: (channel, identifier, code, profile) => req('/api/account/otp/verify', { method: 'POST', body: { channel, identifier, code, profile } }),
  requestLink: (channel, identifier) => req('/api/account/link/request', { method: 'POST', auth: true, body: { channel, identifier } }),
  verifyLink: (channel, identifier, code) => req('/api/account/link/verify', { method: 'POST', auth: true, body: { channel, identifier, code } }),
  me: () => req('/api/account/me', { auth: true }),
  update: data => req('/api/account', { method: 'PUT', auth: true, body: data }),
  saveAddresses: addresses => req('/api/account/addresses', { method: 'PUT', auth: true, body: { addresses } }),
  createOrder: data => req('/api/orders', { method: 'POST', auth: true, body: data }),
  listOrders: () => req('/api/orders', { auth: true }),
  getOrder: id => req(`/api/orders/${id}`, { auth: true }),
  trackOrder: (id, token) => req(`/api/orders/track/${id}?token=${encodeURIComponent(token)}`),
  // Which payment methods checkout may offer (online payment needs Whish creds
  // on the server). Older servers don't have this route — treat that as COD-only.
  paymentMethods: () => req('/api/payment/methods'),
  // Ask the server to re-check an online payment against Whish and settle the
  // order if it's been paid. Authorized by the session or the order's track token.
  reconcilePayment: (id, token) =>
    req(`/api/orders/${id}/reconcile${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'POST',
      auth: true
    })
};

const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on mount: hydrate the token from storage, then verify.
  useEffect(() => {
    let active = true;
    (async () => {
      const t = await storage.get(KEYS.customerToken);
      cachedToken = t;
      if (!t) {
        if (active) setLoading(false);
        return;
      }
      try {
        const me = await accountApi.me();
        if (active) setCustomer(me);
      } catch {
        await clearPersistedToken();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loginWithOtp = useCallback(async (channel, identifier, code, profile) => {
    const { token, customer: c, linkChannel: offer } = await accountApi.verifyOtp(channel, identifier, code, profile);
    await persistToken(token);
    setCustomer(c);
    return { customer: c, linkChannel: offer };
  }, []);

  const adoptToken = useCallback(async token => {
    await persistToken(token);
    const me = await accountApi.me();
    setCustomer(me);
    return me;
  }, []);

  const linkChannel = useCallback(async (channel, identifier, code) => {
    const { token, customer: c } = await accountApi.verifyLink(channel, identifier, code);
    await persistToken(token);
    setCustomer(c);
    return c;
  }, []);

  const logout = useCallback(async () => {
    await clearPersistedToken();
    setCustomer(null);
  }, []);

  const refresh = useCallback(async () => {
    const c = await accountApi.me();
    setCustomer(c);
    return c;
  }, []);

  return <AccountContext.Provider value={{ customer, loading, loginWithOtp, adoptToken, linkChannel, logout, refresh, setCustomer }}>{children}</AccountContext.Provider>;
}

export const useAccount = () => useContext(AccountContext);
