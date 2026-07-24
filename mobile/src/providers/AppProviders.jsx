// The single provider stack the whole app is wrapped in (from the root layout):
//   Theme → Redux (cart) → React Query (server cache, persisted) → Account → Content
//
// React Query is persisted to AsyncStorage: on relaunch the catalog paints
// instantly from the last snapshot while a background refetch brings it fresh.
// Cart persistence: hydrate from AsyncStorage on mount, then mirror changes back.

import { useEffect, useRef, useState } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { store } from '@/src/store';
import { hydrateCart } from '@/src/store/cartSlice';
import { storage, KEYS } from '@/src/lib/storage';
import { ThemeProvider } from '@/src/theme';
import { AccountProvider } from '@/src/lib/account';
import { ContentProvider } from '@/src/content/ContentProvider';

const DAY = 24 * 60 * 60 * 1000;

export default function AppProviders({ children }) {
  const hydrated = useRef(false);

  // Restore the cart, then subscribe to persist future changes.
  useEffect(() => {
    let unsubscribe;
    (async () => {
      const saved = await storage.getJSON(KEYS.cart, null);
      if (saved?.items?.length) store.dispatch(hydrateCart(saved.items));
      hydrated.current = true;
      unsubscribe = store.subscribe(() => {
        storage.setJSON(KEYS.cart, { items: store.getState().cart.items });
      });
    })();
    return () => unsubscribe?.();
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data stays "fresh" for 5 min: hopping between tabs or pushing
            // back/forward re-renders from cache with zero network wait.
            staleTime: 5 * 60_000,
            gcTime: DAY,
            refetchOnWindowFocus: false,
            retry: 1
          }
        }
      })
  );

  const [persister] = useState(() => createAsyncStoragePersister({ storage: AsyncStorage, key: 'as_query_cache', throttleTime: 2000 }));

  return (
    <ThemeProvider>
      <ReduxProvider store={store}>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: DAY }}>
          <AccountProvider>
            <ContentProvider>{children}</ContentProvider>
          </AccountProvider>
        </PersistQueryClientProvider>
      </ReduxProvider>
    </ThemeProvider>
  );
}
