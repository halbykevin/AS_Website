// Custom bottom tab bar — the app's main navigation chrome.
//
// Modern commerce styling: rounded top corners with a soft lifted shadow, a
// brand-tinted pill behind the active tab, outline icons that switch to their
// filled variant when focused, and a live cart-count badge on the Bag tab.
// Built from the theme so it stays on-brand with everything else.

import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSelector } from 'react-redux'
import { selectCartCount } from '@/src/store/cartSlice'
import { useTheme, useThemedStyles } from '@/src/theme'
import Text from '@/src/ui/Text'

// route name → [outline icon, filled icon]
const ICONS = {
  index: ['storefront-outline', 'storefront'],
  shop: ['grid-outline', 'grid'],
  bag: ['bag-handle-outline', 'bag-handle'],
  events: ['calendar-outline', 'calendar'],
  account: ['person-outline', 'person'],
}

export default function TabBar({ state, descriptors, navigation }) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()
  const cartCount = useSelector(selectCartCount)

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]
        const label = options.title ?? route.name
        const focused = state.index === index
        const [outline, filled] = ICONS[route.name] || ['ellipse-outline', 'ellipse']
        const color = focused ? theme.colors.primary : theme.colors.textFaint

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name)
        }

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            onPress={onPress}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons name={focused ? filled : outline} size={22} color={color} />
              {route.name === 'bag' && cartCount > 0 ? (
                <View style={styles.badge}>
                  <Text variant="overline" color="textOnPrimary" style={styles.badgeText}>
                    {cartCount}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="caption" numberOfLines={1} style={[styles.label, { color }]}>
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const makeStyles = (t) => ({
  bar: {
    flexDirection: 'row',
    backgroundColor: t.colors.background,
    borderTopLeftRadius: t.radii['2xl'],
    borderTopRightRadius: t.radii['2xl'],
    paddingTop: 10,
    paddingHorizontal: t.spacing.sm,
    // Lifted shadow pointing up so the bar floats above the content.
    ...t.shadows.raised,
    shadowOffset: { width: 0, height: -6 },
  },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  pressed: { opacity: 0.7 },
  iconWrap: {
    width: 58,
    height: 32,
    borderRadius: t.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: t.alpha(t.colors.primary, 0.12) },
  badge: {
    position: 'absolute',
    right: 8,
    top: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: t.colors.background,
  },
  badgeText: { fontSize: 9, lineHeight: 12 },
  label: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.2 },
})
