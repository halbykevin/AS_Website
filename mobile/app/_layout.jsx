import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import AppProviders from '@/src/providers/AppProviders';
import GlobalPromoFrame from '@/src/components/GlobalPromoBanner';
import StorePopupModal from '@/src/components/StorePopupModal';
import CrashScreen from '@/src/components/CrashScreen';
import Boundary from '@/src/components/Boundary';
import { installGlobalErrorHandler } from '@/src/lib/errors';

// Expo Router renders this instead of a white screen when a route throws while
// rendering. This is the *root* boundary — the last resort. Individual routes
// export their own (`ScreenBoundary`) so a broken screen keeps navigation alive
// instead of falling all the way through to here.
export { CrashScreen as ErrorBoundary };

// Errors thrown outside render — async callbacks, timers, native modules — never
// reach a React boundary and, in a release build, take the whole app down by
// default. Installed at module scope so it is in place before the first screen
// mounts; the call is idempotent.
installGlobalErrorHandler();

// The navigator itself, kept as its own component so the promo frame's boundary
// below can fall back to rendering it bare.
function AppStack() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#ffffff' } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="search" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <AppProviders>
          {/* These two render above *every* screen, which makes them the most
              dangerous components in the app: unguarded, a bad CMS promo record
              would crash the store, the events, checkout — everything — and no
              per-screen boundary could help, because the failure is above them
              all.

              So the promo frame degrades instead of failing: its boundary falls
              back to the same navigator without the banner wrapped around it.
              Marketing chrome is exactly what you drop first. */}
          <Boundary name="root:promo-frame" fallback={<AppStack />}>
            <GlobalPromoFrame>
              <AppStack />
              {/* App-level so the CMS promo can appear over any screen. */}
              <Boundary name="root:popup" fallback={null}>
                <StorePopupModal />
              </Boundary>
            </GlobalPromoFrame>
          </Boundary>
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
