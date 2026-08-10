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
export const COLS = ['1', '2', '3', '4']
export function gridClass(cols) {
  switch (String(cols)) {
    case '1':
      return 'grid-cols-1'
    case '2':
      return 'grid-cols-2'
    case '3':
      return 'grid-cols-3'
    case '4':
      return 'grid-cols-4'
    default:
      // Auto. One per row on phones: at 2-up a card is ~160px wide, which is
      // where the name gets clipped and the image turns into a thumbnail. Wider
      // screens are unchanged.
      return 'grid-cols-1 sm:grid-cols-3 xl:grid-cols-4'
  }
}

// Which ProductTile shape suits the chosen density.
//   'row'  a single column at every width  → always the horizontal card
//   'auto' one column on phones only       → horizontal below sm, upright above
//   'card' two or more columns             → the upright card
export function tileLayout(cols) {
  const c = String(cols || '')
  if (c === '1') return 'row'
  if (c === '') return 'auto'
  return 'card'
}

const price = (p) => Number(p.price) || 0
const onSale = (p) => Boolean(p.oldPrice) && Number(p.oldPrice) > price(p)
// "Call for price" products arrive with price === null. Left alone they would
// read as $0: bottom of the price slider, first result under "Low to High",
// and a match for any price filter. They have no price, so they take no part in
// price arithmetic — excluded from the bounds and from a price-filtered result,
// and sorted last rather than first.
const noPrice = (p) => Boolean(p.callForPrice) || p.price == null

// Unique categories present in the list, with a product count, sorted by name.
// Used on /shop where the list spans the whole catalog.
export function categoryFacets(products) {
  const map = new Map()
  for (const p of products) {
    const slug = (p.categorySlug || '').trim()
    if (!slug) continue
    const e = map.get(slug) || { value: slug, label: p.category || slug, count: 0 }
    e.count++
    map.set(slug, e)
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
}

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
  const prices = products.filter((p) => !noPrice(p)).map(price)
  if (!prices.length) return { min: 0, max: 0 }
  return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) }
}

export function applyFilters(products, { cat = '', brand = '', min = null, max = null, sale = false } = {}) {
  return products.filter((p) => {
    if (cat && p.categorySlug !== cat) return false
    if (brand && slugify(p.brand) !== brand) return false
    // A product with no price cannot satisfy a price range — saying it does
    // would put an unpriced item inside "under $500".
    if ((min != null || max != null) && noPrice(p)) return false
    if (min != null && price(p) < min) return false
    if (max != null && price(p) > max) return false
    if (sale && !onSale(p)) return false
    return true
  })
}

// Products per page on the browse listings (/shop, /category/*, /search).
export const PAGE_SIZE = 24

// Slice a sorted list into a page. Out-of-range pages clamp to the last page
// so a stale ?page= (e.g. after a filter narrows the list) still renders.
export function paginate(products, page, perPage = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(products.length / perPage))
  const current = Math.min(Math.max(1, Math.floor(Number(page)) || 1), totalPages)
  const start = (current - 1) * perPage
  return {
    items: products.slice(start, start + perPage),
    page: current,
    totalPages,
    total: products.length,
    from: products.length ? start + 1 : 0,
    to: Math.min(start + perPage, products.length),
  }
}

export function sortProducts(products, sort) {
  const arr = [...products]
  switch (sort) {
    // Unpriced products go last in both directions — they are not "cheapest".
    case 'price-asc':
      return arr.sort((a, b) => noPrice(a) - noPrice(b) || price(a) - price(b))
    case 'price-desc':
      return arr.sort((a, b) => noPrice(a) - noPrice(b) || price(b) - price(a))
    case 'newest':
      return arr.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
    case 'name':
      return arr.sort((a, b) => String(a.name).localeCompare(String(b.name)))
    default:
      return arr // 'featured' / unknown -> keep API order (sort, id)
  }
}
