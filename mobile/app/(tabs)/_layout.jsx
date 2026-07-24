// Bottom tab bar: Home (marketing) · Store (commerce) · Events · Account.
// Styled from the theme so it matches the rest of the app; the Store tab shows
// a live cart-count badge.

import { Tabs } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSelector } from 'react-redux'
import { useTheme } from '@/src/theme'
import { selectCartCount } from '@/src/store/cartSlice'

export default function TabsLayout() {
  const theme = useTheme()
  const cartCount = useSelector(selectCartCount)

  const icon = (name) => ({ color, size }) => <Ionicons name={name} size={size} color={color} />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textFaint,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
          height: theme.layout.tabBarHeight + 24,
          paddingTop: 6,
          paddingBottom: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: icon('home-outline') }}
      />
      <Tabs.Screen
        name="store"
        options={{
          title: 'Store',
          tabBarIcon: icon('bag-handle-outline'),
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.colors.primary, color: theme.colors.textOnPrimary, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="events"
        options={{ title: 'Events', tabBarIcon: icon('calendar-outline') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: icon('person-circle-outline') }}
      />
    </Tabs>
  )
}
