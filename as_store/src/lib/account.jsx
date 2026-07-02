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

export const accountApi = {
  requestOtp: (mobile) => req('/api/account/otp/request', { method: 'POST', body: { mobile } }),
  verifyOtp: (mobile, code) => req('/api/account/otp/verify', { method: 'POST', body: { mobile, code } }),
  me: () => req('/api/account/me', { auth: true }),
  update: (data) => req('/api/account', { method: 'PUT', auth: true, body: data }),
  // orders (createOrder also works logged-out — the token is attached only if present)
  createOrder: (data) => req('/api/orders', { method: 'POST', auth: true, body: data }),
  listOrders: () => req('/api/orders', { auth: true }),
  getOrder: (id) => req(`/api/orders/${id}`, { auth: true }),
  trackOrder: (id, token) => req(`/api/orders/track/${id}?token=${encodeURIComponent(token)}`),
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

  // Complete the OTP flow: verify the code, store the session.
  const loginWithOtp = useCallback(async (mobile, code) => {
    const { token, customer } = await accountApi.verifyOtp(mobile, code)
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
    <AccountContext.Provider value={{ customer, loading, loginWithOtp, logout, refresh, setCustomer }}>
      {children}
    </AccountContext.Provider>
  )
}

export const useAccount = () => useContext(AccountContext)
