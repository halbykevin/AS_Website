import { createSlice } from '@reduxjs/toolkit'
import { MAX_ITEM_QTY } from '@/src/config/env'

// Cart state — a direct port of the AS Store web cart slice, so behavior
// (including the max-2-per-item policy) matches exactly.
export const MAX_QTY = MAX_ITEM_QTY

const clampQty = (q) => Math.min(MAX_QTY, Math.max(1, Number(q) || 1))

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
    setItemSlug(state, { payload }) {
      const item = state.items.find((i) => i.id === payload.id)
      if (item) item.slug = payload.slug
    },
    clearCart(state) {
      state.items = []
    },
    hydrateCart(state, { payload }) {
      state.items = (Array.isArray(payload) ? payload : []).map((i) => ({ ...i, qty: clampQty(i.qty) }))
    },
  },
})

export const { addItem, removeItem, setQty, setItemSlug, clearCart, hydrateCart } = cartSlice.actions

export const selectCartItems = (s) => s.cart.items
export const selectCartCount = (s) => s.cart.items.reduce((n, i) => n + i.qty, 0)
export const selectCartTotal = (s) => s.cart.items.reduce((sum, i) => sum + i.price * i.qty, 0)

export default cartSlice.reducer
