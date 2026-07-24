// The single provider stack the whole app is wrapped in (from the root layout):
//   Theme → Redux (cart) → React Query (server cache) → Account → Content
//
// Also wires cart persistence: hydrate from AsyncStorage on mount, then mirror
// every change back to it — the RN equivalent of the web store's localStorage
// sync in providers.jsx.

import { useEffect, useRef, useState } from 'react'
import { Provider as ReduxProvider } from 'react-redux'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { store } from '@/src/store'
import { hydrateCart } from '@/src/store/cartSlice'
import { storage, KEYS } from '@/src/lib/storage'
import { ThemeProvider } from '@/src/theme'
import { AccountProvider } from '@/src/lib/account'
import { ContentProvider } from '@/src/content/ContentProvider'

export default function AppProviders({ children }) {
  const hydrated = useRef(false)

  // Restore the cart, then subscribe to persist future changes.
  useEffect(() => {
    let unsubscribe
    ;(async () => {
      const saved = await storage.getJSON(KEYS.cart, null)
      if (saved?.items?.length) store.dispatch(hydrateCart(saved.items))
      hydrated.current = true
      unsubscribe = store.subscribe(() => {
        // Guard so the initial hydrate dispatch doesn't immediately re-write.
        storage.setJSON(KEYS.cart, { items: store.getState().cart.items })
      })
    })()
    return () => unsubscribe?.()
  }, [])

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  )

  return (
    <ThemeProvider>
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <AccountProvider>
            <ContentProvider>{children}</ContentProvider>
          </AccountProvider>
        </QueryClientProvider>
      </ReduxProvider>
    </ThemeProvider>
  )
}
