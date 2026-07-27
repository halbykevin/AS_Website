// Diagnostics for the app's catalog filters (Category / Brand / Price / Sale).
//
// Logs land in the Metro console (`npx expo start`) and in `adb logcat` under
// the ReactNativeJS tag, so they work in a dev run AND in an installed preview
// build. Flip FILTER_DEBUG to false to silence everything.
//
// Kept out of catalogFilters.js on purpose: applyFilters stays pure and
// allocation-free, and all the tracing lives here.

// OFF by default — flip to true only while chasing a filter bug, and put it
// back before committing.
//
// This is not free tracing. A single filter toggle fires logApply + logDraft +
// logFilterResult, and logFilterResult rebuilds its report with `filterStats`,
// which walks the whole catalog five more times (including re-slugifying every
// brand) purely to say what got rejected. On /category/all that is ~0.8ms of
// extra compute — but the real cost is three console.log calls of nested
// objects crossing the RN bridge on every single interaction, which is what
// made applying a filter feel like the app had hung. It was shipping `true`, so
// preview and production builds paid for it too.
export const FILTER_DEBUG = false;

const slugify = s =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const price = p => Number(p.price) || 0;
const onSale = p => Boolean(p.oldPrice) && Number(p.oldPrice) > price(p);

const log = (...args) => {
  if (FILTER_DEBUG) console.log('[filters]', ...args);
};

// Re-runs the filter predicates counting WHICH one rejected each product, plus
// the vocabulary actually present in the data. When a filter yields nothing this
// distinguishes "the filter is broken" from "that value matches no product".
export function filterStats(products, { cat = '', brand = '', min = null, max = null, sale = false } = {}) {
  const rejected = { cat: 0, brand: 0, min: 0, max: 0, sale: 0 };
  let passed = 0;
  for (const p of products) {
    if (cat && p.categorySlug !== cat) {
      rejected.cat++;
      continue;
    }
    if (brand && slugify(p.brand) !== brand) {
      rejected.brand++;
      continue;
    }
    if (min != null && price(p) < min) {
      rejected.min++;
      continue;
    }
    if (max != null && price(p) > max) {
      rejected.max++;
      continue;
    }
    if (sale && !onSale(p)) {
      rejected.sale++;
      continue;
    }
    passed++;
  }
  const catValues = new Set(products.map(p => p.categorySlug).filter(Boolean));
  const brandValues = new Set(products.map(p => slugify(p.brand)).filter(Boolean));
  return {
    in: products.length,
    out: passed,
    rejected,
    catExistsInData: cat ? catValues.has(cat) : null,
    brandExistsInData: brand ? brandValues.has(brand) : null,
    missingCategorySlug: products.filter(p => !p.categorySlug).length,
    missingBrand: products.filter(p => !p.brand || !String(p.brand).trim()).length
  };
}

// What the screen loaded: is the data even filterable?
export function logCatalogLoad(where, products) {
  if (!FILTER_DEBUG) return;
  const withCat = products.filter(p => p.categorySlug).length;
  const withBrand = products.filter(p => p.brand && String(p.brand).trim()).length;
  log(`load:${where}`, {
    products: products.length,
    withCategorySlug: withCat,
    withBrand,
    sample: products.slice(0, 2).map(p => ({ id: p.id, cat: p.categorySlug, brand: p.brand }))
  });
  if (products.length && withCat === 0) {
    console.warn('[filters] products have NO categorySlug — the Category facet will be empty.');
  }
  if (products.length && withBrand === 0) {
    console.warn('[filters] products have NO brand — the Brand facet will be empty.');
  }
}

// The option lists handed to the sheet. An empty list is why a row can be
// missing from the Filter sheet entirely.
export function logFacets(where, facets, bounds, showCategory) {
  if (!FILTER_DEBUG) return;
  log(`facets:${where}`, {
    categoryFacets: facets?.categories?.length ?? 0,
    brandFacets: facets?.brands?.length ?? 0,
    categoryRowVisible: showCategory,
    categorySample: (facets?.categories || []).slice(0, 5).map(c => `${c.value}(${c.count})`),
    brandSample: (facets?.brands || []).slice(0, 5).map(b => `${b.value}(${b.count})`),
    bounds
  });
}

// The result of every filter pass, with the culprit when nothing matches.
export function logFilterResult(where, products, filters, visibleCount) {
  if (!FILTER_DEBUG) return;
  const stats = filterStats(products, filters);
  const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null && v !== false));
  log(`result:${where}`, {
    active,
    products: stats.in,
    matched: stats.out,
    rendered: visibleCount,
    rejectedBy: stats.rejected,
    catExistsInData: stats.catExistsInData,
    brandExistsInData: stats.brandExistsInData
  });
  if (stats.in > 0 && stats.out === 0) {
    const [key, n] = Object.entries(stats.rejected).sort((a, b) => b[1] - a[1])[0];
    console.warn(
      `[filters] 0 of ${stats.in} matched — "${key}" rejected ${n}.` +
        (stats.catExistsInData === false ? ` Category "${filters.cat}" is not in this list.` : '') +
        (stats.brandExistsInData === false ? ` Brand "${filters.brand}" is not in this list.` : '')
    );
  }
  if (stats.out !== visibleCount) {
    console.warn(`[filters] MISMATCH: applyFilters matched ${stats.out} but the grid rendered ${visibleCount}.`);
  }
}

// --- Sheet plumbing -----------------------------------------------------------
// Category/Brand are chosen in a NESTED sheet on top of the Filter sheet, so
// these trace whether a pick actually reaches the draft and then the screen.

export const logSheet = (event, detail) => log(`sheet:${event}`, detail ?? '');

export function logPick(field, value, label) {
  log('pick', { field, value: value || '(all)', label });
}

export function logDraft(draft, count) {
  log('draft', { ...draft, matches: count });
}

export function logApply(filters) {
  log('apply→screen', filters);
}
