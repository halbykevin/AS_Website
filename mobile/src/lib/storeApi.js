// AS Store API client (public catalog + settings + CMS pages).
//
// The Express store API already returns camelCase JSON, so there are no mappers
// here — screens consume the shapes directly. Auth/orders live in account.jsx
// (they need the customer token + a React context). Every read fails soft
// (returns [] / null / defaults) so the app never crashes when the API is down.

import { STORE_API_URL } from '@/src/config/env'

const API = STORE_API_URL

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = {}
  if (body != null) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      message = (await res.json()).error || message
    } catch {
      /* ignore */
    }
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

// Absolutize a possibly-relative image path against the API origin. Product
// images are already absolute (PUBLIC_URL/uploads/…) but this is a safe guard.
export function absUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url
  return `${API}${url.startsWith('/') ? '' : '/'}${url}`
}

// ---- Settings (announcement, contact, socials, publish gate, homeNew…) ----
export const defaultStoreSettings = {
  storeName: 'AS Store',
  published: true,
  announcement: { enabled: true, text: 'Free delivery on orders over $100 · 12 months warranty' },
  contact: { email: '', phone: '', whatsapp: '', address: '' },
  socials: {},
  homeNew: { enabled: true, eyebrow: 'Just landed', heading: 'New in.', source: 'newest', categoryId: null, count: 8 },
  loginButton: { label: 'Continue with email', logo: '', weight: 'medium' },
  navLinks: [],
  footerGroups: [],
}

export async function loadStoreSettings() {
  try {
    const s = await req('/api/settings')
    return {
      ...defaultStoreSettings,
      ...s,
      announcement: { ...defaultStoreSettings.announcement, ...(s.announcement || {}) },
      contact: { ...defaultStoreSettings.contact, ...(s.contact || {}) },
      homeNew: { ...defaultStoreSettings.homeNew, ...(s.homeNew || {}) },
    }
  } catch {
    return defaultStoreSettings
  }
}

// ---- Catalog ----
export async function loadCategories() {
  try {
    return await req('/api/categories')
  } catch {
    return []
  }
}

export async function loadBrands() {
  try {
    return await req('/api/brands')
  } catch {
    return []
  }
}

// Products list. Filters: { category, featured, search, limit }.
export async function loadProducts({ category, featured, search, limit } = {}) {
  const params = new URLSearchParams()
  if (category && category !== 'All') params.set('category', category)
  if (featured) params.set('featured', '1')
  if (search) params.set('search', search)
  if (limit) params.set('limit', String(limit))
  const qs = params.toString() ? `?${params}` : ''
  try {
    return await req(`/api/products${qs}`)
  } catch {
    return []
  }
}

// Single product by slug (full image gallery). null when missing.
export async function loadProduct(slug) {
  try {
    return await req(`/api/products/${encodeURIComponent(slug)}`)
  } catch {
    return null
  }
}

// Single product by numeric id — used to backfill slugs on old cart items.
export async function loadProductById(id) {
  try {
    return await req(`/api/products/id/${id}`)
  } catch {
    return null
  }
}

// ---- CMS pages (support, warranty, about, privacy…) ----
export async function loadPage(slug) {
  try {
    return await req(`/api/pages/${encodeURIComponent(slug)}`)
  } catch {
    return null
  }
}

export { req as storeRequest, API as STORE_API }
