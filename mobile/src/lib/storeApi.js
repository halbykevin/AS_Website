import { STORE_API_URL } from '@/src/config/env';

const API = STORE_API_URL;

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body != null) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = (await res.json()).error || message;
    } catch {
      /* ignore */
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2)(:\d+)?/i;

export function mediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  // Absolute URL: rebase only loopback hosts; pass real remote URLs through.
  if (/^https?:\/\//i.test(url)) {
    return LOOPBACK_ORIGIN.test(url) ? url.replace(LOOPBACK_ORIGIN, API) : url;
  }
  // Relative path (e.g. `/uploads/…`) → absolutize against the API origin.
  return `${API}${url.startsWith('/') ? '' : '/'}${url}`;
}

// Back-compat alias — same behavior for callers that referenced absUrl.
export const absUrl = mediaUrl;

// Rewrite a product's image fields through mediaUrl so they load on any device.
function mapProduct(p) {
  if (!p) return p;
  return {
    ...p,
    image: mediaUrl(p.image),
    images: Array.isArray(p.images) ? p.images.map(mediaUrl) : []
  };
}

// A product that arrived from somewhere other than this API — the assistant's
// answers come through the storefront's /api/chat, which reads the catalog on
// its own server. Same rows, so the same image rebasing has to happen or the
// photos point at whatever host that server talks to (localhost, in dev).
export const mapChatProduct = mapProduct;

// The API returns categories with `imageUrl`; the tiles read `image`. Bridge the
// field name and normalize the host in one place.
function mapCategory(c) {
  return { ...c, image: mediaUrl(c.image || c.imageUrl) };
}

// ---- Settings (announcement, contact, socials, publish gate, homeNew…) ----
export const defaultStoreSettings = {
  storeName: 'AS Store',
  published: true,
  announcement: {
    enabled: true,
    text: 'Free delivery on orders over $100 · 12 months warranty'
  },
  contact: { email: '', phone: '', whatsapp: '', address: '' },
  socials: {},
  homeNew: {
    enabled: true,
    eyebrow: 'Just landed',
    heading: 'New in.',
    source: 'newest',
    categoryId: null,
    count: 8
  },
  loginButton: { label: 'Continue with email', logo: '', weight: 'medium' },
  // Delivery charge; real values come from the API's settings row.
  delivery: { fee: 0, freeOver: 100 },
  // VAT rate in percent; 0 = no VAT line at checkout.
  vat: { percent: 0 },
  // What a price-hidden product shows instead of a price. Mirrors the web's
  // defaults so both read the same when the CMS field is untouched.
  callForPrice: {
    label: 'Call for price',
    button: 'Ask for a price',
    note: '',
    message: "Hi, I'd like a price for {product} — {url}",
    url: ''
  },
  navLinks: [],
  footerGroups: []
};

export async function loadStoreSettings() {
  try {
    const s = await req('/api/settings');
    return {
      ...defaultStoreSettings,
      ...s,
      announcement: {
        ...defaultStoreSettings.announcement,
        ...(s.announcement || {})
      },
      contact: { ...defaultStoreSettings.contact, ...(s.contact || {}) },
      homeNew: { ...defaultStoreSettings.homeNew, ...(s.homeNew || {}) },
      delivery: { ...defaultStoreSettings.delivery, ...(s.delivery || {}) },
      vat: { ...defaultStoreSettings.vat, ...(s.vat || {}) },
      callForPrice: { ...defaultStoreSettings.callForPrice, ...(s.callForPrice || {}) }
    };
  } catch {
    return defaultStoreSettings;
  }
}

// ---- Promotions popup ----
// Null when the CMS has it disabled or it's outside its schedule window (the
// API decides that, so nothing unpublished reaches the app). The image is
// rebased through mediaUrl so `/uploads/...` paths resolve on a device.
export async function loadPopup() {
  try {
    const p = await req('/api/popup');
    return p ? { ...p, image: mediaUrl(p.image) } : null;
  } catch {
    return null;
  }
}

// ---- Catalog ----
export async function loadCategories() {
  try {
    const rows = await req('/api/categories');
    return Array.isArray(rows) ? rows.map(mapCategory) : [];
  } catch {
    return [];
  }
}

export async function loadBrands() {
  try {
    return await req('/api/brands');
  } catch {
    return [];
  }
}

// Products list. Filters: { category, featured, search, limit }.
export async function loadProducts({ category, featured, search, limit } = {}) {
  const params = new URLSearchParams();
  if (category && category !== 'All') params.set('category', category);
  if (featured) params.set('featured', '1');
  if (search) params.set('search', search);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString() ? `?${params}` : '';
  try {
    const rows = await req(`/api/products${qs}`);
    return Array.isArray(rows) ? rows.map(mapProduct) : [];
  } catch {
    return [];
  }
}

// Single product by slug (full image gallery). null when missing.
export async function loadProduct(slug) {
  try {
    return mapProduct(await req(`/api/products/${encodeURIComponent(slug)}`));
  } catch {
    return null;
  }
}

// Single product by numeric id — used to backfill slugs on old cart items.
export async function loadProductById(id) {
  try {
    return mapProduct(await req(`/api/products/id/${id}`));
  } catch {
    return null;
  }
}

// ---- CMS pages (support, warranty, about, privacy…) ----
export async function loadPage(slug) {
  try {
    return await req(`/api/pages/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

export { req as storeRequest, API as STORE_API };
