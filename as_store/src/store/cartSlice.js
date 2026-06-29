import { createSlice } from '@reduxjs/toolkit'

// Cart state. Kept intentionally simple for the UI phase — persistence and the
// real checkout flow come with the backend prompt.
const initialState = {
  items: [], // { id, title, image, price, qty }
}

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addItem(state, { payload }) {
      const existing = state.items.find((i) => i.id === payload.id)
      if (existing) {
        existing.qty += payload.qty ?? 1
      } else {
        state.items.push({
          id: payload.id,
          title: payload.title,
          image: payload.image,
          price: payload.price,
          qty: payload.qty ?? 1,
        })
      }
    },
    removeItem(state, { payload }) {
      state.items = state.items.filter((i) => i.id !== payload)
    },
    setQty(state, { payload }) {
      const item = state.items.find((i) => i.id === payload.id)
      if (item) item.qty = Math.max(1, payload.qty)
    },
    clearCart(state) {
      state.items = []
    },
    // Replace the whole cart (used to restore from localStorage on load).
    hydrateCart(state, { payload }) {
      state.items = Array.isArray(payload) ? payload : []
    },
  },
})

export const { addItem, removeItem, setQty, clearCart, hydrateCart } = cartSlice.actions

// Selectors
export const selectCartItems = (s) => s.cart.items
export const selectCartCount = (s) => s.cart.items.reduce((n, i) => n + i.qty, 0)
export const selectCartTotal = (s) => s.cart.items.reduce((sum, i) => sum + i.price * i.qty, 0)

export default cartSlice.reducer
