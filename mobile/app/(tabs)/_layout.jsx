import { Tabs } from 'expo-router';
import TabBar from '@/src/components/TabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop' }} />
      <Tabs.Screen name="bag" options={{ title: 'Bag' }} />
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
