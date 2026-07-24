import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppProviders from '@/src/providers/AppProviders';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#ffffff' } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="search" options={{ presentation: 'modal' }} />
          </Stack>
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
