'use client'

// Admin API client for the AS Store CMS. Talks to the Express server, attaches
// the Bearer token from localStorage, and throws readable errors.

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
const TOKEN_KEY = 'as_store_admin_token'

export const getToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)
export const isAuthed = () => Boolean(getToken())

// Content endpoints whose writes change what the public storefront renders — a
// successful write to any of these purges the SSR cache so the edit shows at once.
// The popup is intentionally absent: StorePopup fetches it live on the client,
// so its saves need no purge (and a purge is a whole-site one — not worth it).
const STOREFRONT_CONTENT = /\/api\/(products|categories|brands|sales|homepage-sections|pages|settings|uploads)/

// Fire-and-forget the storefront cache purge (same-origin Next route). Best-effort:
// a failure just means the 1-hour TTL eventually refreshes the data instead.
function purgeStorefrontCache() {
  const t = getToken()
  if (!t) return
  fetch('/api/revalidate', { method: 'POST', headers: { Authorization: `Bearer ${t}` } }).catch(() => {})
}

async function req(path, { method = 'GET', body, auth = false, form = false } = {}) {
  const headers = {}
  if (!form) headers['Content-Type'] = 'application/json'
  if (auth) {
    const t = getToken()
    if (t) headers.Authorization = `Bearer ${t}`
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: form ? body : body != null ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    clearToken()
    throw new Error('Session expired — please sign in again.')
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error || `Request failed (${res.status})`)
  }
  const data = res.status === 204 ? null : await res.json()
  if (method !== 'GET' && STOREFRONT_CONTENT.test(path)) purgeStorefrontCache()
  return data
}

// Build a query string from a params object, dropping empty values so a blank
// filter never narrows a list to nothing.
const qs = (params) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v != null),
  ).toString()
  return s ? `?${s}` : ''
}

export const adminApi = {
  // auth
  login: (email, password) => req('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => req('/api/auth/me', { auth: true }),

  // products
  listProducts: () => req('/api/products?all=1', { auth: true }),
  createProduct: (data) => req('/api/products', { method: 'POST', auth: true, body: data }),
  updateProduct: (id, data) => req(`/api/products/${id}`, { method: 'PUT', auth: true, body: data }),
  deleteProduct: (id) => req(`/api/products/${id}`, { method: 'DELETE', auth: true }),
  // Flip "call for price" across a whole selection in one request — marking
  // every Apple laptop one at a time is the difference between the feature
  // being used and not.
  bulkCallForPrice: (ids, callForPrice) =>
    req('/api/products/bulk/call-for-price', {
      method: 'PUT',
      auth: true,
      body: { ids, callForPrice },
    }),

  // product images
  listImages: (id) => req(`/api/products/${id}/images`, { auth: true }),
  addImage: (id, url) => req(`/api/products/${id}/images`, { method: 'POST', auth: true, body: { url } }),
  deleteImage: (id, imageId) =>
    req(`/api/products/${id}/images/${imageId}`, { method: 'DELETE', auth: true }),

  // categories
  listCategories: () => req('/api/categories?all=1', { auth: true }),
  createCategory: (data) => req('/api/categories', { method: 'POST', auth: true, body: data }),
  updateCategory: (id, data) =>
    req(`/api/categories/${id}`, { method: 'PUT', auth: true, body: data }),
  deleteCategory: (id) => req(`/api/categories/${id}`, { method: 'DELETE', auth: true }),

  // settings
  getSettings: () => req('/api/settings'),
  updateSettings: (data) => req('/api/settings', { method: 'PUT', auth: true, body: data }),

  // Promotions / announcements popup (singleton)
  getPopup: () => req('/api/admin/popup', { auth: true }),
  updatePopup: (data) => req('/api/admin/popup', { method: 'PUT', auth: true, body: data }),

  // pages
  listPages: () => req('/api/pages?all=1', { auth: true }),
  createPage: (data) => req('/api/pages', { method: 'POST', auth: true, body: data }),
  updatePage: (id, data) => req(`/api/pages/${id}`, { method: 'PUT', auth: true, body: data }),
  deletePage: (id) => req(`/api/pages/${id}`, { method: 'DELETE', auth: true }),

  // homepage sections
  listSections: () => req('/api/homepage-sections?all=1', { auth: true }),
  createSection: (data) => req('/api/homepage-sections', { method: 'POST', auth: true, body: data }),
  updateSection: (id, data) =>
    req(`/api/homepage-sections/${id}`, { method: 'PUT', auth: true, body: data }),
  deleteSection: (id) => req(`/api/homepage-sections/${id}`, { method: 'DELETE', auth: true }),
  reorderSections: (ids) =>
    req('/api/homepage-sections/reorder', { method: 'POST', auth: true, body: { ids } }),

  // uploads
  upload: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return req('/api/uploads', { method: 'POST', auth: true, body: fd, form: true })
  },

  // brands
  listBrands: () => req('/api/brands?all=1', { auth: true }),
  createBrand: (data) => req('/api/brands', { method: 'POST', auth: true, body: data }),
  updateBrand: (id, data) => req(`/api/brands/${id}`, { method: 'PUT', auth: true, body: data }),
  deleteBrand: (id) => req(`/api/brands/${id}`, { method: 'DELETE', auth: true }),

  // sales / promotions
  listSales: () => req('/api/sales', { auth: true }),
  createSale: (data) => req('/api/sales', { method: 'POST', auth: true, body: data }),
  updateSale: (id, data) => req(`/api/sales/${id}`, { method: 'PUT', auth: true, body: data }),
  deleteSale: (id) => req(`/api/sales/${id}`, { method: 'DELETE', auth: true }),

  // scraper / import
  startScrape: (opts) => req('/api/scrape', { method: 'POST', auth: true, body: opts }),
  getScrape: (id) => req(`/api/scrape/${id}`, { auth: true }),

  // notifications — campaigns
  notifOverview: () => req('/api/admin/notifications/overview', { auth: true }),
  listCampaigns: () => req('/api/admin/notifications/campaigns', { auth: true }),
  getCampaign: (id) => req(`/api/admin/notifications/campaigns/${id}`, { auth: true }),
  createCampaign: (data) =>
    req('/api/admin/notifications/campaigns', { method: 'POST', auth: true, body: data }),
  updateCampaign: (id, data) =>
    req(`/api/admin/notifications/campaigns/${id}`, { method: 'PUT', auth: true, body: data }),
  deleteCampaign: (id) =>
    req(`/api/admin/notifications/campaigns/${id}`, { method: 'DELETE', auth: true }),
  sendCampaign: (id) =>
    req(`/api/admin/notifications/campaigns/${id}/send`, { method: 'POST', auth: true }),
  scheduleCampaign: (id, at) =>
    req(`/api/admin/notifications/campaigns/${id}/schedule`, { method: 'POST', auth: true, body: { at } }),
  pauseCampaign: (id) =>
    req(`/api/admin/notifications/campaigns/${id}/pause`, { method: 'POST', auth: true }),
  cancelCampaign: (id) =>
    req(`/api/admin/notifications/campaigns/${id}/cancel`, { method: 'POST', auth: true }),
  duplicateCampaign: (id) =>
    req(`/api/admin/notifications/campaigns/${id}/duplicate`, { method: 'POST', auth: true }),
  testCampaign: (id, target) =>
    req(`/api/admin/notifications/campaigns/${id}/test`, { method: 'POST', auth: true, body: target }),
  previewAudience: (audience) =>
    req('/api/admin/notifications/audience/preview', { method: 'POST', auth: true, body: { audience } }),

  // notifications — templates, activity, audit
  listNotifTemplates: () => req('/api/admin/notifications/templates', { auth: true }),
  updateNotifTemplate: (id, data) =>
    req(`/api/admin/notifications/templates/${id}`, { method: 'PUT', auth: true, body: data }),
  recentNotifications: () => req('/api/admin/notifications/recent', { auth: true }),
  notifAudit: () => req('/api/admin/notifications/audit', { auth: true }),

  // surveys
  listSurveys: () => req('/api/admin/surveys', { auth: true }),
  createSurvey: (data) => req('/api/admin/surveys', { method: 'POST', auth: true, body: data }),
  updateSurvey: (id, data) => req(`/api/admin/surveys/${id}`, { method: 'PUT', auth: true, body: data }),
  deleteSurvey: (id) => req(`/api/admin/surveys/${id}`, { method: 'DELETE', auth: true }),
  surveyResponses: (id) => req(`/api/admin/surveys/${id}/responses`, { auth: true }),

  // customers — directory + sign-in history
  listCustomers: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null),
    ).toString()
    return req(`/api/admin/customers${qs ? `?${qs}` : ''}`, { auth: true })
  },
  customerStats: () => req('/api/admin/customers/stats', { auth: true }),
  listCustomerLogins: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null),
    ).toString()
    return req(`/api/admin/customers/logins${qs ? `?${qs}` : ''}`, { auth: true })
  },
  getCustomer: (id) => req(`/api/admin/customers/${id}`, { auth: true }),
  deleteCustomer: (id) => req(`/api/admin/customers/${id}`, { method: 'DELETE', auth: true }),

  // Daily Spin — the app's prize wheel, its spin log, and the vouchers it mints
  getSpin: () => req('/api/admin/spin', { auth: true }),
  updateSpin: (data) => req('/api/admin/spin', { method: 'PUT', auth: true, body: data }),
  createSpinPrize: (data) => req('/api/admin/spin/prizes', { method: 'POST', auth: true, body: data }),
  updateSpinPrize: (id, data) =>
    req(`/api/admin/spin/prizes/${id}`, { method: 'PUT', auth: true, body: data }),
  deleteSpinPrize: (id) => req(`/api/admin/spin/prizes/${id}`, { method: 'DELETE', auth: true }),
  listSpins: (params = {}) => req(`/api/admin/spin/spins${qs(params)}`, { auth: true }),
  // Give one customer their spin back — records a reset, never deletes a spin.
  resetSpinCooldown: (customerId, note = '') =>
    req('/api/admin/spin/resets', { method: 'POST', auth: true, body: { customerId, note } }),
  listVouchers: (params = {}) => req(`/api/admin/vouchers${qs(params)}`, { auth: true }),
  createVoucher: (data) => req('/api/admin/vouchers', { method: 'POST', auth: true, body: data }),
  updateVoucher: (id, data) => req(`/api/admin/vouchers/${id}`, { method: 'PUT', auth: true, body: data }),
  deleteVoucher: (id) => req(`/api/admin/vouchers/${id}`, { method: 'DELETE', auth: true }),

  // AS Wallet — store credit: the rules, the ledger, manual adjustments
  getWallet: () => req('/api/admin/wallet', { auth: true }),
  updateWallet: (data) => req('/api/admin/wallet', { method: 'PUT', auth: true, body: data }),
  listWalletLedger: (params = {}) => req(`/api/admin/wallet/ledger${qs(params)}`, { auth: true }),
  adjustWallet: (data) => req('/api/admin/wallet/adjust', { method: 'POST', auth: true, body: data }),
  // Re-runs the earn rules over every order. Safe to repeat — it writes only
  // the difference — and the way to apply a changed rate to past orders.
  resyncWallet: () => req('/api/admin/wallet/resync', { method: 'POST', auth: true }),

  // orders
  listOrders: (status) =>
    req(`/api/admin/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`, { auth: true }),
  getOrder: (id) => req(`/api/admin/orders/${id}`, { auth: true }),
  updateOrderStatus: (id, status) =>
    req(`/api/admin/orders/${id}`, { method: 'PUT', auth: true, body: { status } }),
  deleteOrder: (id) => req(`/api/admin/orders/${id}`, { method: 'DELETE', auth: true }),
}
