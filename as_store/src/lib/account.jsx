'use client'

// Storefront customer accounts: a tiny API client + a React context that holds
// the signed-in customer (token in localStorage) for the whole storefront.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
const TOKEN_KEY = 'as_store_customer_token'

export const getCustomerToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t)
const clearToken = () => localStorage.removeItem(TOKEN_KEY)

async function req(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const t = getCustomerToken()
    if (t) headers.Authorization = `Bearer ${t}`
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error || `Request failed (${res.status})`)
  }
  return res.status === 204 ? null : res.json()
}

// Where you land after signing in, unless a `?next=` says otherwise (checkout
// sends you back to checkout). Shopping is the point, so it's the storefront —
// the account page is somewhere you go deliberately, via the nav.
export const AFTER_SIGN_IN = '/'

// Google sign-in is a full-page trip (browser → our API → Google → our API →
// /auth/google), not a fetch, so all the client needs is the URL to leave for.
export const googleSignInUrl = (next = AFTER_SIGN_IN) =>
  `${API}/api/account/google/start?next=${encodeURIComponent(next)}`

export const accountApi = {
  // Which sign-in methods the API can actually complete right now.
  authMethods: () => req('/api/account/auth/methods'),
  // Sign-in codes. `channel` is 'email' or 'whatsapp'; `identifier` is the email
  // address or the mobile number to send to.
  requestOtp: (channel, identifier) =>
    req('/api/account/otp/request', { method: 'POST', body: { channel, identifier } }),
  // `profile` is the sign-up form's details (name/mobile/address) — the server
  // applies them once the code proves the email is theirs. Omitted when signing in.
  verifyOtp: (channel, identifier, code, profile) =>
    req('/api/account/otp/verify', { method: 'POST', body: { channel, identifier, code, profile } }),
  // Linking a second sign-in channel onto the account you're already signed into.
  requestLink: (channel, identifier) =>
    req('/api/account/link/request', { method: 'POST', auth: true, body: { channel, identifier } }),
  verifyLink: (channel, identifier, code) =>
    req('/api/account/link/verify', { method: 'POST', auth: true, body: { channel, identifier, code } }),
  me: () => req('/api/account/me', { auth: true }),
  update: (data) => req('/api/account', { method: 'PUT', auth: true, body: data }),
  saveAddresses: (addresses) =>
    req('/api/account/addresses', { method: 'PUT', auth: true, body: { addresses } }),
  // orders (createOrder also works logged-out — the token is attached only if present)
  createOrder: (data) => req('/api/orders', { method: 'POST', auth: true, body: data }),
  listOrders: () => req('/api/orders', { auth: true }),
  getOrder: (id) => req(`/api/orders/${id}`, { auth: true }),
  trackOrder: (id, token) => req(`/api/orders/track/${id}?token=${encodeURIComponent(token)}`),
  // Re-check an online (Whish) payment and settle the order if it's been paid.
  // Works signed-in (token attached if present) or as a guest via the track token.
  reconcilePayment: (id, token) =>
    req(`/api/orders/${id}/reconcile${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'POST',
      auth: true,
    }),
  // notifications (inbox, preferences, surveys)
  listNotifications: (before) =>
    req(`/api/notifications${before ? `?before=${before}` : ''}`, { auth: true }),
  unreadNotifications: () => req('/api/notifications/unread-count', { auth: true }),
  readNotification: (id) => req(`/api/notifications/${id}/read`, { method: 'POST', auth: true }),
  clickNotification: (id) => req(`/api/notifications/${id}/click`, { method: 'POST', auth: true }),
  readAllNotifications: () => req('/api/notifications/read-all', { method: 'POST', auth: true }),
  getNotificationPrefs: () => req('/api/notifications/prefs', { auth: true }),
  saveNotificationPrefs: (prefs) =>
    req('/api/notifications/prefs', { method: 'PUT', auth: true, body: prefs }),
  getSurvey: (id) => req(`/api/surveys/${id}`),
  respondSurvey: (id, orderId, answers) =>
    req(`/api/surveys/${id}/responses`, { method: 'POST', auth: true, body: { orderId, answers } }),
}

const AccountContext = createContext(null)

export function AccountProvider({ children }) {
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore the session on mount if a token is present.
  useEffect(() => {
    if (!getCustomerToken()) {
      setLoading(false)
      return
    }
    accountApi
      .me()
      .then(setCustomer)
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  // Complete the OTP flow: verify the code, store the session. Resolves to the
  // customer plus `linkChannel` — the sign-in method they haven't added yet, so
  // the caller can offer to link it (null when there's nothing to offer).
  const loginWithOtp = useCallback(async (channel, identifier, code, profile) => {
    const { token, customer, linkChannel: offer } = await accountApi.verifyOtp(
      channel,
      identifier,
      code,
      profile,
    )
    setToken(token)
    setCustomer(customer)
    return { customer, linkChannel: offer }
  }, [])

  // Adopt a token minted elsewhere — Google hands ours back through the URL when
  // it returns the shopper to /auth/google.
  const adoptToken = useCallback(async (token) => {
    setToken(token)
    const me = await accountApi.me()
    setCustomer(me)
    return me
  }, [])

  // Attach a second sign-in channel to the current account. The server may merge
  // two rows and return a token for the survivor, so always take the new token.
  const linkChannel = useCallback(async (channel, identifier, code) => {
    const { token, customer } = await accountApi.verifyLink(channel, identifier, code)
    setToken(token)
    setCustomer(customer)
    return customer
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setCustomer(null)
  }, [])

  const refresh = useCallback(async () => {
    const c = await accountApi.me()
    setCustomer(c)
    return c
  }, [])

  return (
    <AccountContext.Provider
      value={{ customer, loading, loginWithOtp, adoptToken, linkChannel, logout, refresh, setCustomer }}
    >
      {children}
    </AccountContext.Provider>
  )
}

export const useAccount = () => useContext(AccountContext)
