import { createSlice } from '@reduxjs/toolkit'

// Transient UI state (not persisted). Currently just the cart drawer.
const initialState = {
  cartOpen: false,
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openCart(state) {
      state.cartOpen = true
    },
    closeCart(state) {
      state.cartOpen = false
    },
    toggleCart(state) {
      state.cartOpen = !state.cartOpen
    },
  },
})

export const { openCart, closeCart, toggleCart } = uiSlice.actions

export const selectCartOpen = (s) => s.ui.cartOpen

export default uiSlice.reducer
