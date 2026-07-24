'use client'

import { useEffect, useState } from 'react'
import { Provider as ReduxProvider } from 'react-redux'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { store } from '@/store'
import { hydrateCart } from '@/store/cartSlice'
import { AccountProvider } from '@/lib/account'

const CART_KEY = 'as_store_cart'
// Bump to invalidate every persisted cache after a shape-changing deploy.
const RQ_CACHE_BUSTER = 'as-store-rq-v1'

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

  // Persist the cache to localStorage so reloads/repeat visits render instantly
  // (then refetch in the background). Created client-side only — localStorage
  // doesn't exist during SSR. Scoped to storefront product queries so admin data
  // never lingers stale in a browser.
  const [persister] = useState(() =>
    typeof window === 'undefined'
      ? null
      : createSyncStoragePersister({ storage: window.localStorage, key: 'as_store_rq' }),
  )

  const tree = <AccountProvider>{children}</AccountProvider>

  // On the server (no persister) fall back to a plain provider.
  if (!persister) {
    return (
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>
      </ReduxProvider>
    )
  }

  return (
    <ReduxProvider store={store}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24, // 24h
          buster: RQ_CACHE_BUSTER,
          dehydrateOptions: {
            // Only persist successful storefront product-rail queries.
            shouldDehydrateQuery: (q) => q.queryKey?.[0] === 'products' && q.state.status === 'success',
          },
        }}
      >
        {tree}
      </PersistQueryClientProvider>
    </ReduxProvider>
  )
}
