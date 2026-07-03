// Server-side catalog loaders for the storefront (categories + their products).
// Like lib/site.js: `cache: 'no-store'` so CMS/scraper changes show immediately,
// with safe fallbacks so a page never crashes when the API is offline.

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

// Visible categories, sorted (sort, id) by the API.
export async function loadCategories() {
  try {
    const res = await fetch(`${API}/api/categories`, { cache: 'no-store' })
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

// Visible products in one category (by slug).
export async function loadCategoryProducts(slug) {
  try {
    const res = await fetch(`${API}/api/products?category=${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

// Every visible product (the /shop all-products page).
export async function loadAllProducts() {
  try {
    const res = await fetch(`${API}/api/products`, { cache: 'no-store' })
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
    const res = await fetch(`${API}/api/products?search=${encodeURIComponent(term)}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

// Single product by slug (full image gallery). Returns null if not found.
export async function loadProduct(slug) {
  try {
    const res = await fetch(`${API}/api/products/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
