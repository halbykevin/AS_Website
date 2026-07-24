'use client'

import { useEffect, useState } from 'react'
import { Provider as ReduxProvider } from 'react-redux'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { store } from '@/store'
import { hydrateCart } from '@/store/cartSlice'
import { AccountProvider } from '@/lib/account'

const CART_KEY = 'as_store_cart'

// Wraps the app in Redux (cart/UI state) + React Query (server data).
// The QueryClient is created once per browser session via useState.
export default function Providers({ children }) {
  // Restore the cart from localStorage on mount, then keep it in sync. Done in
  // an effect (client-only) so it never causes an SSR hydration mismatch.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || 'null')
      if (saved?.items?.length) store.dispatch(hydrateCart(saved.items))
    } catch {
      /* ignore */
    }
    return store.subscribe(() => {
      try {
        localStorage.setItem(CART_KEY, JSON.stringify({ items: store.getState().cart.items }))
      } catch {
        /* ignore */
      }
    })
  }, [])

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <AccountProvider>{children}</AccountProvider>
      </QueryClientProvider>
    </ReduxProvider>
  )
}
