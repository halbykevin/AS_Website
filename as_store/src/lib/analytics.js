"use client";

// Google tag plumbing for the storefront: one place that knows how to talk to
// gtag.js, so pages and the cart just say what happened.
//
// Two products share this tag:
//   • GA4 (G-…)  — reporting: what people browse, where they drop off.
//   • Google Ads (AW-…) — conversion tracking: which ad click produced an order,
//     which is what Smart Bidding optimises against. Without it a campaign is
//     spending blind.
//
// Everything is pushed onto `dataLayer` rather than calling window.gtag(), and
// that is deliberate: dataLayer is a plain array that exists before gtag.js has
// loaded, so an event fired during hydration (the purchase on the order page is
// the real case) is queued and replayed in order once the script arrives. It
// must be pushed as an `arguments` object — gtag.js ignores plain arrays.
//
// The IDs are admin-editable (Settings → Marketing tags) and arrive from the
// server via <Analytics tracking={…}/>. Nothing here runs until they are set.

let config = {
  enabled: false,
  ga4Id: "",
  adsConversionId: "",
  adsPurchaseLabel: "",
  adsBeginCheckoutLabel: "",
  adsAddToCartLabel: "",
};

let initialised = false;

export const CURRENCY = "USD";

function push() {
  // eslint-disable-next-line prefer-rest-params -- gtag.js requires the real
  // `arguments` object; spreading it into an array breaks the command queue.
  window.dataLayer.push(arguments);
}

export const analyticsReady = () =>
  config.enabled && Boolean(config.ga4Id || config.adsConversionId);

// Queue the `js` + `config` commands. Called during the first render of
// <Analytics> — before any child effect can fire an event — so the queue is
// always in the order gtag.js expects: config first, events after.
export function initAnalytics(next) {
  config = { ...config, ...(next || {}) };
  if (typeof window === "undefined" || initialised || !analyticsReady()) return;
  initialised = true;
  window.dataLayer = window.dataLayer || [];
  push("js", new Date());
  // send_page_view is off because this is a single-page app: gtag would only
  // ever see the first URL. pageView() below reports every route change,
  // including the first one.
  if (config.ga4Id) push("config", config.ga4Id, { send_page_view: false });
  if (config.adsConversionId) push("config", config.adsConversionId);
}

export function pageView(path) {
  if (typeof window === "undefined" || !analyticsReady() || !config.ga4Id)
    return;
  window.dataLayer = window.dataLayer || [];
  push("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function track(name, params = {}) {
  if (typeof window === "undefined" || !analyticsReady()) return;
  window.dataLayer = window.dataLayer || [];
  push("event", name, params);
}

// A Google Ads conversion is the same gtag event with a `send_to` pointing at
// one specific conversion action ("AW-123456789/AbC-D_efGhIj"). No label
// configured for this step = Ads simply isn't told about it, which is the
// normal case for the optional ones.
function adsConversion(label, params) {
  if (!config.adsConversionId || !label) return;
  track("conversion", {
    send_to: `${config.adsConversionId}/${label}`,
    ...params,
  });
}

// --- Ecommerce ------------------------------------------------------------
// GA4's standard ecommerce shapes. Sticking to the documented event and
// parameter names is what makes the reports (and the Ads import) work without
// any extra configuration.

const item = (i) => ({
  item_id: String(i.id ?? i.item_id ?? ""),
  item_name: i.title || i.name || "",
  price: Number(i.price) || 0,
  quantity: Number(i.qty) || 1,
  ...(i.brand ? { item_brand: i.brand } : {}),
  ...(i.category ? { item_category: i.category } : {}),
});

const sum = (items) =>
  items.reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);

export function trackViewItem(product) {
  if (!product) return;
  track("view_item", {
    currency: CURRENCY,
    value: Number(product.price) || 0,
    items: [item({ ...product, qty: 1 })],
  });
}

export function trackAddToCart(entry) {
  const value = (Number(entry.price) || 0) * (Number(entry.qty) || 1);
  track("add_to_cart", { currency: CURRENCY, value, items: [item(entry)] });
  adsConversion(config.adsAddToCartLabel, { value, currency: CURRENCY });
}

export function trackBeginCheckout(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return;
  const value = sum(list);
  track("begin_checkout", { currency: CURRENCY, value, items: list.map(item) });
  adsConversion(config.adsBeginCheckoutLabel, { value, currency: CURRENCY });
}

// The one that pays for everything: reported to GA4 and, separately, to the Ads
// conversion action so a campaign can be optimised and measured. `transaction_id`
// is the order id — Google dedupes on it, so a customer refreshing the
// confirmation page can never inflate the numbers even if the localStorage
// guard on that page is gone.
export function trackPurchase(order) {
  if (!order?.id) return;
  const items = (order.items || []).map(item);
  const value = Number(order.total ?? 0);
  track("purchase", {
    transaction_id: String(order.id),
    currency: CURRENCY,
    value,
    ...(order.deliveryFee ? { shipping: Number(order.deliveryFee) } : {}),
    items,
  });
  adsConversion(config.adsPurchaseLabel, {
    value,
    currency: CURRENCY,
    transaction_id: String(order.id),
  });
}
