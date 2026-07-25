import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import AppProviders from '@/src/providers/AppProviders';
import GlobalPromoFrame from '@/src/components/GlobalPromoBanner';

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
          </GlobalPromoFrame>
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
