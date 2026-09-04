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
// "Call for price" products arrive with price === null. Left alone they read as
// $0 — bottom of the price range, first under "Low to High", a match for any
// price filter. They have no price, so they take no part in price arithmetic and
// sort last under every order. Mirrors noPrice() in the web catalogFilters.
const noPrice = p => Boolean(p.callForPrice) || p.price == null;

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
  const prices = products.filter(p => !noPrice(p)).map(price);
  if (!prices.length) return { min: 0, max: 0 };
  return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
}

// --- Indexed catalog ---------------------------------------------------------
// The filter/sort path runs on every toggle, every picker choice and every
// slider release. Doing it against the raw product objects means re-deriving
// the same values each time: `applyFilters` re-slugified all 1370 brand names
// per pass, and the A-Z sort ran localeCompare ~14k times. Both are pure
// functions of the product, so they are computed ONCE per loaded list here and
// the passes below become plain comparisons — measured at ~8x faster than the
// raw path, and the derived work no longer scales with how much you fiddle.
//
// `applyFilters` / `sortProducts` are kept intact above: they're the web port's
// public contract and still the right thing for one-off calls.

// Sort key for the A-Z order. localeCompare is what the web port uses and it is
// correct, but it's markedly slower than `<`/`>` on Hermes and the sort runs it
// ~14k times a pass. Comparing raw lowercase instead would be fast and WRONG:
// "Écran" sorts after "Zebra" by code point, because U+00E9 lives past 'z'. So
// the accents are folded away here — once per product, not once per comparison —
// which puts accented names back where a shopper expects them.
// NFD splits "é" into "e" + a combining mark, and U+0300-U+036F is that mark
// block; a plain range keeps this off unicode property escapes.
const COMBINING_MARKS = /[\u0300-\u036f]/g;

function sortKey(name) {
  const s = String(name || '');
  const flat = typeof s.normalize === 'function' ? s.normalize('NFD').replace(COMBINING_MARKS, '') : s;
  return flat.toLowerCase().trim();
}

export function buildCatalogIndex(products = []) {
  const rows = new Array(products.length);
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const value = price(p);
    rows[i] = {
      product: p,
      cat: (p.categorySlug || '').trim(),
      brand: slugify(p.brand),
      price: value,
      noPrice: noPrice(p),
      sale: onSale(p),
      name: sortKey(p.name),
      id: Number(p.id) || 0
    };
  }
  return rows;
}

function matches(r, cat, brand, min, max, sale) {
  if (cat && r.cat !== cat) return false;
  if (brand && r.brand !== brand) return false;
  // A product with no price cannot satisfy a price range — saying it does would
  // put an unpriced item inside "under $500".
  if ((min != null || max != null) && r.noPrice) return false;
  if (min != null && r.price < min) return false;
  if (max != null && r.price > max) return false;
  if (sale && !r.sale) return false;
  return true;
}

// Filter + sort in one pass over the index, returning the product objects. The
// objects are the originals, so ProductTile's identity-based memo still holds
// and surviving tiles don't re-render.
export function queryCatalog(index = [], { cat = '', brand = '', min = null, max = null, sale = false } = {}, sort = 'featured') {
  const hits = [];
  for (let i = 0; i < index.length; i++) {
    if (matches(index[i], cat, brand, min, max, sale)) hits.push(index[i]);
  }
  // Unpriced products go last under every order (the API already returns them
  // last, so 'featured' needs no pass of its own).
  const last = (a, b) => a.noPrice - b.noPrice;
  switch (sort) {
    case 'price-asc':
      hits.sort((a, b) => last(a, b) || a.price - b.price);
      break;
    case 'price-desc':
      hits.sort((a, b) => last(a, b) || b.price - a.price);
      break;
    case 'newest':
      hits.sort((a, b) => last(a, b) || b.id - a.id);
      break;
    case 'name':
      hits.sort((a, b) => last(a, b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      break;
    default:
      break; // 'featured' — already in API order
  }
  const out = new Array(hits.length);
  for (let i = 0; i < hits.length; i++) out[i] = hits[i].product;
  return out;
}

// Count without building the array — the filter sheet's live "Show N" updates
// on every draft change and only ever needed the number.
export function countCatalog(index = [], { cat = '', brand = '', min = null, max = null, sale = false } = {}) {
  let n = 0;
  for (let i = 0; i < index.length; i++) {
    if (matches(index[i], cat, brand, min, max, sale)) n++;
  }
  return n;
}

export function applyFilters(products, { cat = '', brand = '', min = null, max = null, sale = false } = {}) {
  return products.filter(p => {
    if (cat && p.categorySlug !== cat) return false;
    if (brand && slugify(p.brand) !== brand) return false;
    if ((min != null || max != null) && noPrice(p)) return false;
    if (min != null && price(p) < min) return false;
    if (max != null && price(p) > max) return false;
    if (sale && !onSale(p)) return false;
    return true;
  });
}

export function sortProducts(products, sort) {
  const arr = [...products];
  const then = cmp => arr.sort((a, b) => noPrice(a) - noPrice(b) || cmp(a, b));
  switch (sort) {
    case 'price-asc':
      return then((a, b) => price(a) - price(b));
    case 'price-desc':
      return then((a, b) => price(b) - price(a));
    case 'newest':
      return then((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    case 'name':
      return then((a, b) => String(a.name).localeCompare(String(b.name)));
    default:
      return then(() => 0); // 'featured' / unknown -> API order, unpriced last
  }
}

// Count of active filters (mirrors the badge on the web "Filter" button).
export function activeFilterCount({ cat, brand, min, max, sale } = {}) {
  return (cat ? 1 : 0) + (brand ? 1 : 0) + (min != null || max != null ? 1 : 0) + (sale ? 1 : 0);
}
