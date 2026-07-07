import { createSlice } from '@reduxjs/toolkit'

// Store policy: at most 2 of any product per order — larger quantities go
// through WhatsApp (the UI shows a note when the cap is hit).
export const MAX_QTY = 2

const clampQty = (q) => Math.min(MAX_QTY, Math.max(1, Number(q) || 1))

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
        existing.qty = clampQty(existing.qty + (payload.qty ?? 1))
      } else {
        state.items.push({
          id: payload.id,
          title: payload.title,
          image: payload.image,
          price: payload.price,
          slug: payload.slug || null,
          qty: clampQty(payload.qty ?? 1),
        })
      }
    },
    removeItem(state, { payload }) {
      state.items = state.items.filter((i) => i.id !== payload)
    },
    setQty(state, { payload }) {
      const item = state.items.find((i) => i.id === payload.id)
      if (item) item.qty = clampQty(payload.qty)
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
        qty: clampQty(i.qty),
      }))
    },
  },
})

export const { addItem, removeItem, setQty, setItemSlug, clearCart, hydrateCart } = cartSlice.actions

// Selectors
export const selectCartItems = (s) => s.cart.items
export const selectCartCount = (s) => s.cart.items.reduce((n, i) => n + i.qty, 0)
export const selectCartTotal = (s) => s.cart.items.reduce((sum, i) => sum + i.price * i.qty, 0)

export default cartSlice.reducer
