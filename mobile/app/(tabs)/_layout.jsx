import { Tabs } from 'expo-router';
import TabBar from '@/src/components/TabBar';

// The app opens on Shop, not Home.
//
// Nearly everything anyone comes here to do is in the store — browse, search,
// buy, track an order — and making them tap once before they can start was a
// toll on every session. Home is still the first tab, because it is the company
// and the way back out of a pushed screen, but it is no longer the landing.
//
// `initialRouteName` rather than a redirect from Home: a redirect renders the
// wrong screen for a frame and then throws it away, which on a cold start is
// the one frame the user is actually watching.
export const unstable_settings = { initialRouteName: 'shop' };

export default function TabsLayout() {
  return (
    <Tabs tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false }} initialRouteName="shop">
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop' }} />
      <Tabs.Screen name="bag" options={{ title: 'Bag' }} />
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
