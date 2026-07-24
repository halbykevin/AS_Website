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

// Single product by slug (full image gallery). Returns null if not found.
export async function loadProduct(slug) {
  try {
    const res = await fetch(`${API}/api/products/${encodeURIComponent(slug)}`, STORE_CACHE)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
