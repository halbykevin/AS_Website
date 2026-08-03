import { configureStore } from '@reduxjs/toolkit'
import cartReducer, { addItem } from './cartSlice'
import uiReducer from './uiSlice'
import { trackAddToCart } from '@/lib/analytics'

// Every route into the cart goes through addItem — product page, product tiles,
// the assistant's results — so reporting the event here covers all of them at
// once and can't be forgotten when a new "Add to Bag" button appears somewhere.
// hydrateCart is deliberately not tracked: restoring a saved bag on page load
// is not a customer action, and counting it would inflate the funnel.
const analytics = () => (next) => (action) => {
  const result = next(action)
  if (addItem.match(action)) {
    try {
      trackAddToCart(action.payload)
    } catch {
      /* analytics must never break a dispatch */
    }
  }
  return result
}

export const store = configureStore({
  reducer: {
    cart: cartReducer,
    ui: uiReducer,
  },
  middleware: (getDefault) => getDefault().concat(analytics),
})
