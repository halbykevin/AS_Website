import { createSlice } from '@reduxjs/toolkit'

// Store policy: at most 2 of any product per order — larger quantities go
// through WhatsApp (the UI shows a note when the cap is hit). It is the
// DEFAULT, not the law: a product can carry its own `minQty`/`maxQty` (the API
// resolves them onto every product it serves), because a rule written for
// phones has no business capping a software licence someone is buying 130 of.
// Mirrors MAX_ITEM_QTY in as_store/server/src/app.js, which is the authority.
export const MAX_QTY = 2

const bound = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// A line's own ceiling, floor and grid. Read off the cart item, which carries
// what came back with the product — so a bag saved months ago is still clamped
// by what that product allowed at the time, and re-adding it refreshes them.
export const maxQtyOf = (item) => bound(item?.maxQty, MAX_QTY)
export const minQtyOf = (item) => bound(item?.minQty, 1)

// The smallest amount this line moves in. 1 = whole units, which is the only
// sane answer for anything in a box. Below 1 the quantity is really an amount:
// at $1 a licence, 0.01 is what lets someone settling $7.50 enter 7.5.
export const stepOf = (item) => bound(item?.qtyStep, 1)

// True when a line is worth a typed quantity box rather than a +/− stepper —
// either because it goes far beyond the store cap (tapping + 130 times is not
// a quantity picker, it is a punishment) or because it takes halves, which no
// stepper can reach.
export const isBulk = (item) => maxQtyOf(item) > MAX_QTY || stepOf(item) < 1

// What the box is actually asking for, in a word.
//
// A stepper over 1–2 needs no label — nobody wonders what it counts. A typed
// box over 5–10,000 does: where the step is below 1 the number is not a count
// of boxes to ship but an amount of the product, and at $1 a licence it IS the
// dollars being settled. Leaving that to be inferred from the running total
// underneath is leaving the one thing the field is for unsaid.
export const qtyLabelOf = (item) =>
  stepOf(item) < 1 ? (Number(item?.price) === 1 ? 'Amount ($)' : 'Amount') : 'Quantity'

// Mirrors snapQty() in as_store/server/src/app.js, which is the authority —
// same floor-onto-the-grid, same 1e6 guard against 7.5 / 0.01 landing on
// 749.9999999999999, same settle at two decimals. This exists so the bag can
// show the figure before the order is created, never to decide it.
const clampQty = (q, item) => {
  const step = stepOf(item)
  const min = minQtyOf(item)
  const n = Number(q)
  const wanted = Number.isFinite(n) && n > 0 ? n : min
  const snapped = Math.floor(Math.round((wanted / step) * 1e6) / 1e6) * step
  return Math.round(Math.min(maxQtyOf(item), Math.max(min, snapped)) * 100) / 100
}

// A quantity that is really an amount is one thing in the bag, not seven and a
// half things — the badge over the bag icon counts entries, not dollars.
const countOf = (item) => (stepOf(item) < 1 ? 1 : item.qty)

// "7.5", "130" — never "7.50" or "130.00". The quantity is shown as the
// customer would say it.
export const formatQty = (n) => String(Math.round(Number(n || 0) * 100) / 100)

// Cart state. Kept intentionally simple for the UI phase — persistence and the
// real checkout flow come with the backend prompt.
const initialState = {
  items: [], // { id, title, image, price, qty, slug }
}

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addItem(state, { payload }) {
      const existing = state.items.find((i) => i.id === payload.id)
      if (existing) {
        // Refresh the bounds from the payload first: they come off the product
        // the shopper is looking at right now, so a cap raised in the admin
        // takes effect on the next add instead of being pinned to whatever the
        // line was created with.
        if (payload.maxQty != null) existing.maxQty = payload.maxQty
        if (payload.minQty != null) existing.minQty = payload.minQty
        if (payload.qtyStep != null) existing.qtyStep = payload.qtyStep
        if (payload.exclusive != null) existing.exclusive = payload.exclusive
        existing.qty = clampQty(existing.qty + (payload.qty ?? 1), existing)
      } else {
        state.items.push({
          id: payload.id,
          title: payload.title,
          image: payload.image,
          price: payload.price,
          slug: payload.slug || null,
          // Carried on the line so the bag and the checkout can price and cap
          // it without re-fetching every product they hold.
          exclusive: Boolean(payload.exclusive),
          minQty: payload.minQty ?? null,
          maxQty: payload.maxQty ?? null,
          qtyStep: payload.qtyStep ?? null,
          qty: clampQty(payload.qty ?? 1, payload),
        })
      }
    },
    removeItem(state, { payload }) {
      state.items = state.items.filter((i) => i.id !== payload)
    },
    setQty(state, { payload }) {
      const item = state.items.find((i) => i.id === payload.id)
      if (item) item.qty = clampQty(payload.qty, item)
    },
    // Backfill the product slug on an item that was saved before slugs were
    // tracked, so the cart drawer can link it to its product page.
    setItemSlug(state, { payload }) {
      const item = state.items.find((i) => i.id === payload.id)
      if (item) item.slug = payload.slug
    },
    clearCart(state) {
      state.items = []
    },
    // Replace the whole cart (used to restore from localStorage on load).
    // Clamps quantities so carts persisted before the cap still respect it.
    hydrateCart(state, { payload }) {
      state.items = (Array.isArray(payload) ? payload : []).map((i) => ({
        ...i,
        qty: clampQty(i.qty, i),
      }))
    },
  },
})

export const { addItem, removeItem, setQty, setItemSlug, clearCart, hydrateCart } = cartSlice.actions

// Selectors
export const selectCartItems = (s) => s.cart.items
export const selectCartCount = (s) => s.cart.items.reduce((n, i) => n + countOf(i), 0)
export const selectCartTotal = (s) =>
  Math.round(s.cart.items.reduce((sum, i) => sum + i.price * i.qty, 0) * 100) / 100

// A bag holding an exclusive item. The server refuses to mix one with ordinary
// products (db/exclusive.sql), so the bag is either wholly exclusive — priced
// with no VAT, no delivery, no wallet and no vouchers, paid with Whish — or it
// is a mix the checkout has to point out before the order is attempted.
export const selectHasExclusive = (s) => s.cart.items.some((i) => i.exclusive)
export const selectExclusiveOnly = (s) =>
  s.cart.items.length > 0 && s.cart.items.every((i) => i.exclusive)

export default cartSlice.reducer
