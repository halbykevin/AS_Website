import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import AppProviders from '@/src/providers/AppProviders';
import GlobalPromoFrame from '@/src/components/GlobalPromoBanner';
import StorePopupModal from '@/src/components/StorePopupModal';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <AppProviders>
          <GlobalPromoFrame>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#ffffff' } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="search" options={{ presentation: 'modal' }} />
            </Stack>
            {/* App-level so the CMS promo can appear over any screen. */}
            <StorePopupModal />
          </GlobalPromoFrame>
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
