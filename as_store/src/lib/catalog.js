// Server-side catalog loaders for the storefront (categories + their products).
// Cached on Vercel's data cache under the shared 'store' tag with a 1-hour
// safety-net TTL; an admin content save purges the tag (via /api/revalidate) so
// edits show immediately. Safe fallbacks keep a page from crashing when the API
// is offline.

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

// Cache options shared by every storefront loader. `revalidateTag('store')`
// (fired on admin writes) invalidates all of these at once; `revalidate` is a
// self-healing fallback in case a purge is ever missed.
export const STORE_CACHE = { next: { tags: ['store'], revalidate: 3600 } }

// Visible categories, sorted (sort, id) by the API.
export async function loadCategories() {
  try {
    const res = await fetch(`${API}/api/categories`, STORE_CACHE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

export async function loadCategory(slug) {
  const cats = await loadCategories()
  return cats.find((c) => c.slug === slug) || null
}

// Visible brands, sorted by the API. Used on the About page's brand wall.
export async function loadBrands() {
  try {
    const res = await fetch(`${API}/api/brands`, STORE_CACHE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

// Visible products in one category (by slug).
export async function loadCategoryProducts(slug) {
  try {
    const res = await fetch(`${API}/api/products?category=${encodeURIComponent(slug)}`, STORE_CACHE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

// Every visible product (the /shop all-products page).
export async function loadAllProducts() {
  try {
    const res = await fetch(`${API}/api/products`, STORE_CACHE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

// One homepage row's products. The homepage is a stack of these, so each row
// asks for only what it shows rather than the whole catalog: `category` pulls a
// category *and its subcategories* (the API resolves the parent), `featured` the
// starred products, `sort: 'newest'` the newest first. Every row inherits the
// API's browse order, which keeps "call for price" products at the end.
export async function loadRowProducts({ category = '', featured = false, sort = '', limit = 24 } = {}) {
  const qs = new URLSearchParams()
  if (category) qs.set('category', category)
  if (featured) qs.set('featured', '1')
  if (sort) qs.set('sort', sort)
  qs.set('limit', String(Math.max(1, Number(limit) || 24)))
  try {
    const res = await fetch(`${API}/api/products?${qs}`, STORE_CACHE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

// Every visible product *with its full gallery* — what the Google Merchant feed
// reads (app/google-merchant.xml). Separate from loadAllProducts() rather than a
// flag on it because the two want different things: the storefront grids need
// one photo per product and are fetched constantly, while the feed wants every
// photo and is fetched hourly. Its own URL means its own cache entry, still
// under the shared 'store' tag, so an admin save purges both together.
export async function loadProductsWithGallery() {
  try {
    const res = await fetch(`${API}/api/products?images=all`, STORE_CACHE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

// Search products by name (server-side, no cache).
export async function searchProducts(q) {
  const term = (q || '').trim()
  if (!term) return []
  try {
    const res = await fetch(`${API}/api/products?search=${encodeURIComponent(term)}`, STORE_CACHE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

// Filtered catalog search — what the shopping assistant's search_products tool
// runs. Every argument is optional; with none it degrades to "everything".
// Filtering happens in Postgres (including the price bounds, against the real
// sale-adjusted price), so the model never sees products it shouldn't offer.
export async function searchCatalog({ query, category, minPrice, maxPrice, limit = 8 } = {}) {
  const qs = new URLSearchParams()
  if (query) qs.set('search', query)
  if (category) qs.set('category', category)
  if (Number.isFinite(Number(minPrice))) qs.set('minPrice', String(Number(minPrice)))
  if (Number.isFinite(Number(maxPrice))) qs.set('maxPrice', String(Number(maxPrice)))
  qs.set('limit', String(Math.min(12, Math.max(1, Number(limit) || 8))))
  try {
    const res = await fetch(`${API}/api/products?${qs}`, STORE_CACHE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

// A CMS page (shipping, warranty, support…) — the assistant quotes these rather
// than answering policy questions from the model's own guesswork.
export async function loadPage(slug) {
  try {
    const res = await fetch(`${API}/api/pages/${encodeURIComponent(slug)}`, STORE_CACHE)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Single product by slug (full image gallery). Returns null if not found — or
// if the product is hidden.
//
// That second case is not fussiness. GET /api/products/:slug deliberately has
// no `visible` filter, because the admin and the app read the same route, so a
// hidden product used to render a completely normal, indexable, add-to-bag page
// to anyone holding its URL — and Google holds them all, since the product was
// in the sitemap until the day it was hidden. The catalog sync hides delisted
// products exactly this way (visible=false + delisted_at), so every product the
// source shop dropped kept a live page advertising something we no longer sell.
// A storefront loader answering "no such product" is the right shape; the page
// then 404s and Google drops the URL.
export async function loadProduct(slug) {
  try {
    const res = await fetch(`${API}/api/products/${encodeURIComponent(slug)}`, STORE_CACHE)
    if (!res.ok) return null
    const product = await res.json()
    return product?.visible === false ? null : product
  } catch {
    return null
  }
}
