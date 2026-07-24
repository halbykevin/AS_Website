// Pure helpers for sorting/filtering a product list — the RN port of the AS
// Store web `lib/catalogFilters.js`, kept byte-for-byte compatible so the mobile
// catalog behaves exactly like the website: same sort order, same facets, same
// on-sale rule. No React here — importable from anywhere.

export const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name: A to Z' }
];

export const slugify = s =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Columns-per-row choices the shopper can pick. A chosen number is applied
// literally; the default (no choice = "Auto") uses a sensible responsive count.
export const COLS = ['2', '3', '4'];

// Resolve the density choice to an actual column count for the FlatList. "Auto"
// is 2 on phones and scales up on wider screens (tablets / landscape).
export function resolveColumns(cols, width = 0) {
  const n = Number(cols);
  if (n === 2 || n === 3 || n === 4) return n;
  if (width >= 900) return 4;
  if (width >= 620) return 3;
  return 2; // Auto default on phones
}

const price = p => Number(p.price) || 0;
const onSale = p => Boolean(p.oldPrice) && Number(p.oldPrice) > price(p);

// Unique categories present in the list, with a product count, sorted by name.
export function categoryFacets(products) {
  const map = new Map();
  for (const p of products) {
    const slug = (p.categorySlug || '').trim();
    if (!slug) continue;
    const e = map.get(slug) || { value: slug, label: p.category || slug, count: 0 };
    e.count++;
    map.set(slug, e);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// Unique brands present in the list, with a product count, sorted by name.
export function brandFacets(products) {
  const map = new Map();
  for (const p of products) {
    const name = (p.brand || '').trim();
    if (!name) continue;
    const value = slugify(name);
    const e = map.get(value) || { value, label: name, count: 0 };
    e.count++;
    map.set(value, e);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// Min/max price across the list (rounded to whole units).
export function priceBounds(products) {
  const prices = products.map(price);
  if (!prices.length) return { min: 0, max: 0 };
  return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
}

export function applyFilters(products, { cat = '', brand = '', min = null, max = null, sale = false } = {}) {
  return products.filter(p => {
    if (cat && p.categorySlug !== cat) return false;
    if (brand && slugify(p.brand) !== brand) return false;
    if (min != null && price(p) < min) return false;
    if (max != null && price(p) > max) return false;
    if (sale && !onSale(p)) return false;
    return true;
  });
}

export function sortProducts(products, sort) {
  const arr = [...products];
  switch (sort) {
    case 'price-asc':
      return arr.sort((a, b) => price(a) - price(b));
    case 'price-desc':
      return arr.sort((a, b) => price(b) - price(a));
    case 'newest':
      return arr.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    case 'name':
      return arr.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    default:
      return arr; // 'featured' / unknown -> keep API order
  }
}

// Count of active filters (mirrors the badge on the web "Filter" button).
export function activeFilterCount({ cat, brand, min, max, sale } = {}) {
  return (cat ? 1 : 0) + (brand ? 1 : 0) + (min != null || max != null ? 1 : 0) + (sale ? 1 : 0);
}
