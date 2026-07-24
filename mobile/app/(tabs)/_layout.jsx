// Bottom tabs — the store is the app's core, so it owns the navigation:
//   Home (storefront) · Shop (browse) · Bag (cart) · Events · Account
// The marketing/company content lives at /company (linked from Home + Account).
// Rendered through the custom themed TabBar (active pill, filled icons, badge).

import { Tabs } from 'expo-router'
import TabBar from '@/src/components/TabBar'

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop' }} />
      <Tabs.Screen name="bag" options={{ title: 'Bag' }} />
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  )
}
