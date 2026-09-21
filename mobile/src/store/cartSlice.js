import { createSlice } from '@reduxjs/toolkit';
import { MAX_ITEM_QTY } from '@/src/config/env';

// Cart state — a direct port of the AS Store web cart slice, so behavior
// (including the max-2-per-item policy) matches exactly.
//
// MAX_QTY is the DEFAULT, not the law: a product can carry its own
// `minQty`/`maxQty`, which the API resolves onto every product it serves. A cap
// written for phones has no business limiting a software licence someone is
// buying 130 of. as_store/server/src/app.js is the authority; a bag that
// disagrees with it just gets clamped there.
export const MAX_QTY = MAX_ITEM_QTY;

const bound = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// A line's own ceiling, floor and grid, read off the cart item — which carries
// what came back with the product.
export const maxQtyOf = item => bound(item?.maxQty, MAX_QTY);
export const minQtyOf = item => bound(item?.minQty, 1);

// The smallest amount this line moves in. 1 = whole units, the only sane answer
// for anything in a box. Below 1 the quantity is really an amount: at $1 a
// licence, 0.01 is what lets someone settling $7.50 enter 7.5.
export const stepOf = item => bound(item?.qtyStep, 1);

// True when a line deserves a typed quantity box rather than a +/− stepper —
// it goes far past the store cap (tapping + 130 times is not a quantity
// picker), or it takes halves, which no stepper can reach.
export const isBulk = item => maxQtyOf(item) > MAX_QTY || stepOf(item) < 1;

// What the box is actually asking for, in a word. A step below 1 means the
// number typed is an amount of the product rather than a count of boxes, and at
// $1 a licence it IS the dollars being settled. Mirrors qtyLabelOf in the web
// slice: the same field must be worded the same on both.
export const qtyLabelOf = item => (stepOf(item) < 1 ? (Number(item?.price) === 1 ? 'Amount ($)' : 'Amount') : 'Quantity');

// Mirrors snapQty() in as_store/server/src/app.js, which is the authority —
// same floor-onto-the-grid, same 1e6 guard against 7.5 / 0.01 landing on
// 749.9999999999999, same settle at two decimals.
const clampQty = (q, item) => {
  const step = stepOf(item);
  const min = minQtyOf(item);
  const n = Number(q);
  const wanted = Number.isFinite(n) && n > 0 ? n : min;
  const snapped = Math.floor(Math.round((wanted / step) * 1e6) / 1e6) * step;
  return Math.round(Math.min(maxQtyOf(item), Math.max(min, snapped)) * 100) / 100;
};

// A quantity that is really an amount is one thing in the bag, not seven and a
// half things — the tab-bar badge counts entries, not dollars.
const countOf = item => (stepOf(item) < 1 ? 1 : item.qty);

// "7.5", "130" — never "7.50" or "130.00".
export const formatQty = n => String(Math.round(Number(n || 0) * 100) / 100);

const initialState = {
  items: [] // { id, title, image, price, qty, slug }
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addItem(state, { payload }) {
      const existing = state.items.find(i => i.id === payload.id);
      if (existing) {
        // Refresh the bounds from the payload: they come off the product being
        // looked at right now, so a cap changed in the admin takes effect on
        // the next add rather than staying pinned to whatever the line was
        // first created with.
        if (payload.maxQty != null) existing.maxQty = payload.maxQty;
        if (payload.minQty != null) existing.minQty = payload.minQty;
        if (payload.qtyStep != null) existing.qtyStep = payload.qtyStep;
        if (payload.exclusive != null) existing.exclusive = payload.exclusive;
        existing.qty = clampQty(existing.qty + (payload.qty ?? 1), existing);
      } else {
        state.items.push({
          id: payload.id,
          title: payload.title,
          image: payload.image,
          price: payload.price,
          slug: payload.slug || null,
          // Carried on the line so the bag and the checkout can cap and price
          // it without re-fetching every product they hold.
          exclusive: Boolean(payload.exclusive),
          minQty: payload.minQty ?? null,
          maxQty: payload.maxQty ?? null,
          qtyStep: payload.qtyStep ?? null,
          qty: clampQty(payload.qty ?? 1, payload)
        });
      }
    },
    removeItem(state, { payload }) {
      state.items = state.items.filter(i => i.id !== payload);
    },
    setQty(state, { payload }) {
      const item = state.items.find(i => i.id === payload.id);
      if (item) item.qty = clampQty(payload.qty, item);
    },
    setItemSlug(state, { payload }) {
      const item = state.items.find(i => i.id === payload.id);
      if (item) item.slug = payload.slug;
    },
    clearCart(state) {
      state.items = [];
    },
    hydrateCart(state, { payload }) {
      state.items = (Array.isArray(payload) ? payload : []).map(i => ({ ...i, qty: clampQty(i.qty, i) }));
    }
  }
});

export const { addItem, removeItem, setQty, setItemSlug, clearCart, hydrateCart } = cartSlice.actions;

export const selectCartItems = s => s.cart.items;
export const selectCartCount = s => s.cart.items.reduce((n, i) => n + countOf(i), 0);
export const selectCartTotal = s => Math.round(s.cart.items.reduce((sum, i) => sum + i.price * i.qty, 0) * 100) / 100;

// A bag holding an exclusive item. The server refuses to mix one with ordinary
// products, so the bag is either wholly exclusive — no VAT, no delivery, no
// wallet, no vouchers, Whish only — or it is a mix checkout has to point out.
export const selectHasExclusive = s => s.cart.items.some(i => i.exclusive);
export const selectExclusiveOnly = s => s.cart.items.length > 0 && s.cart.items.every(i => i.exclusive);

export default cartSlice.reducer;
