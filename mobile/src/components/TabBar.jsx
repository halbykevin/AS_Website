// Custom bottom tab bar — the app's main navigation chrome.
//
// Modern commerce styling: rounded top corners with a soft lifted shadow, a
// brand-tinted "active indicator" pill behind the focused tab, outline icons
// that switch to their filled variant when focused, and a live cart-count badge
// on the Bag tab. Built from the theme so it stays on-brand with everything
// else.
//
// The active pill springs in rather than snapping (Material 3's active-indicator
// pattern), and pressing a tab dips it slightly for tactile feedback. Both are
// skipped when the OS asks for reduced motion.
//
// The Bag tab is also where an add-to-bag flight lands: its icon registers as
// the cart target, and the badge pops as the count changes so the number the
// image just flew into is the one that moves.

import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSelector } from 'react-redux';
import { selectCartCount } from '@/src/store/cartSlice';
import { useTheme, useThemedStyles } from '@/src/theme';
import Text from '@/src/ui/Text';
import { useCartTarget } from './FlyToCart';

// route name → [outline icon, filled icon]
const ICONS = {
  index: ['storefront-outline', 'storefront'],
  shop: ['grid-outline', 'grid'],
  bag: ['bag-handle-outline', 'bag-handle'],
  events: ['calendar-outline', 'calendar'],
  account: ['person-outline', 'person']
};

// Snappy and barely overshooting — a tab bar should feel instant, not springy.
const SPRING = { damping: 18, stiffness: 260, mass: 0.7 };

export default function TabBar({ state, descriptors, navigation }) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const cartCount = useSelector(selectCartCount);
  // Where a flying product photo lands. A screen pushed over the tabs registers
  // its own bag button and takes over while it is up — see FlyToCart.
  const bagRef = useCartTarget('tabbar:bag');

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <TabItem
            key={route.key}
            name={route.name}
            label={options.tabBarAccessibilityLabel ?? label}
            focused={focused}
            onPress={onPress}
            badge={route.name === 'bag' ? cartCount : 0}
            iconRef={route.name === 'bag' ? bagRef : null}
          />
        );
      })}
    </View>
  );
}

function TabItem({ name, label, focused, onPress, badge = 0, iconRef = null }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReducedMotion();

  const [outline, filled] = ICONS[name] || ['ellipse-outline', 'ellipse'];
  const color = focused ? theme.colors.primary : theme.colors.textFaint;

  // 0 = inactive, 1 = active. Drives the pill and the icon's size together so
  // they can never drift out of alignment.
  const active = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(0);
  // Badge pop. Only on a *rise*: removing something from the bag shouldn't
  // celebrate, and the first paint after a restored cart isn't news either.
  const pop = useSharedValue(0);
  const lastBadge = useRef(badge);

  useEffect(() => {
    const grew = badge > lastBadge.current;
    lastBadge.current = badge;
    if (!grew || reduceMotion) return;
    pop.value = 0;
    pop.value = withSpring(1, { damping: 9, stiffness: 320, mass: 0.5 }, () => {
      pop.value = withTiming(0, { duration: 200 });
    });
  }, [badge, reduceMotion, pop]);

  useEffect(() => {
    active.value = reduceMotion ? (focused ? 1 : 0) : withSpring(focused ? 1 : 0, SPRING);
  }, [focused, reduceMotion, active]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    // Grows out of the icon rather than fading in place.
    transform: [{ scaleX: 0.55 + 0.45 * active.value }, { scaleY: 0.7 + 0.3 * active.value }]
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: (1 + 0.08 * active.value) * (1 - 0.1 * press.value) * (1 + 0.22 * pop.value) }]
  }));

  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.45 * pop.value }] }));

  const setPress = to => {
    press.value = reduceMotion ? to : withTiming(to, { duration: to ? 90 : 160 });
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => setPress(1)}
      onPressOut={() => setPress(0)}
      style={styles.item}
    >
      {/* collapsable={false} keeps the view around on Android, where a layout-only
          container is otherwise flattened away and cannot be measured. */}
      <View ref={iconRef} collapsable={false} style={styles.iconWrap}>
        <Animated.View style={[styles.pill, pillStyle]} />
        <Animated.View style={iconStyle}>
          <Ionicons name={focused ? filled : outline} size={22} color={color} />
        </Animated.View>
        {badge > 0 ? (
          <Animated.View style={[styles.badge, badgeStyle]}>
            <Text variant="overline" color="textOnPrimary" style={styles.badgeText}>
              {badge > 99 ? '99+' : badge}
            </Text>
          </Animated.View>
        ) : null}
      </View>
      <Text variant="caption" numberOfLines={1} style={[styles.label, focused && styles.labelActive, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = t => ({
  bar: {
    flexDirection: 'row',
    backgroundColor: t.colors.background,
    borderTopLeftRadius: t.radii['2xl'],
    borderTopRightRadius: t.radii['2xl'],
    paddingTop: 10,
    paddingHorizontal: t.spacing.sm,
    // Lifted shadow pointing up so the bar floats above the content.
    ...t.shadows.raised,
    shadowOffset: { width: 0, height: -6 }
  },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  iconWrap: {
    width: 60,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  // Sits behind the icon and is the only thing that animates in.
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: t.radii.pill,
    backgroundColor: t.alpha(t.colors.primary, 0.13),
    borderWidth: 1,
    borderColor: t.alpha(t.colors.primary, 0.1)
  },
  badge: {
    // Anchored to overlap the icon's top-right corner (icon is 22 centred in 60).
    position: 'absolute',
    right: 10,
    top: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: t.colors.background
  },
  badgeText: { fontSize: 9, lineHeight: 12 },
  label: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.2 },
  labelActive: { fontWeight: '700' }
});
