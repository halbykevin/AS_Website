// Pure helpers for sorting/filtering a product list (used server-side on the
// category page and by the client filter bar). No 'use client' — importable
// from both.

export const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name: A to Z' },
]

export const slugify = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

// Columns-per-row choices the shopper can pick. A chosen number is applied
// literally at EVERY breakpoint (so "2" means 2 columns on a phone too); the
// default (no choice = "Auto") is a responsive layout. Returned strings are
// literal so Tailwind's JIT compiles them.
export const COLS = ['2', '3', '4']
export function gridClass(cols) {
  switch (String(cols)) {
    case '2':
      return 'grid-cols-2'
    case '3':
      return 'grid-cols-3'
    case '4':
      return 'grid-cols-4'
    default:
      return 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4' // Auto
  }
}

const price = (p) => Number(p.price) || 0
const onSale = (p) => Boolean(p.oldPrice) && Number(p.oldPrice) > price(p)

// Unique brands present in the list, with a product count, sorted by name.
export function brandFacets(products) {
  const map = new Map()
  for (const p of products) {
    const name = (p.brand || '').trim()
    if (!name) continue
    const value = slugify(name)
    const e = map.get(value) || { value, label: name, count: 0 }
    e.count++
    map.set(value, e)
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
}

// Min/max price across the list (rounded to whole units).
export function priceBounds(products) {
  const prices = products.map(price)
  if (!prices.length) return { min: 0, max: 0 }
  return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) }
}

export function applyFilters(products, { brand = '', min = null, max = null, sale = false } = {}) {
  return products.filter((p) => {
    if (brand && slugify(p.brand) !== brand) return false
    if (min != null && price(p) < min) return false
    if (max != null && price(p) > max) return false
    if (sale && !onSale(p)) return false
    return true
  })
}

export function sortProducts(products, sort) {
  const arr = [...products]
  switch (sort) {
    case 'price-asc':
      return arr.sort((a, b) => price(a) - price(b))
    case 'price-desc':
      return arr.sort((a, b) => price(b) - price(a))
    case 'newest':
      return arr.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
    case 'name':
      return arr.sort((a, b) => String(a.name).localeCompare(String(b.name)))
    default:
      return arr // 'featured' / unknown -> keep API order (sort, id)
  }
}
