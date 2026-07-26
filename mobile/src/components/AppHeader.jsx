// ---------------------------------------------------------------------------
// AppHeader — the single fixed, responsive, dynamic top bar for both faces of
// the app: the AS Store (dark "ink" chrome) and the AS Company website (light).
//
//  • Fixed     — rendered ABOVE the scroller (never scrolls away). Pair it with
//                Screen's `header` slot, or place it above a FlatList.
//  • Responsive— logo width, gutters and gaps scale to the viewport, and the
//                content is capped so it never over-stretches on tablets/web.
//  • Dynamic   — pass `scrolled` (from useScrolled): the bar smoothly reveals a
//                divider + shadow once content slides underneath, and a compact
//                centered title fades in for context.
//
//   <AppHeader brand="store" search bag scrolled={scrolled} />           // tab
//   <AppHeader brand="store" title="All products" showBack search bag /> // stack
//   <AppHeader brand="company" title="Events" bell scrolled={scrolled} />
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import { Animated, Pressable, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTheme, useThemedStyles } from '@/src/theme';
import { selectCartCount } from '@/src/store/cartSlice';
import { useNotifications } from '@/src/lib/notifications';
import Text from '@/src/ui/Text';
import Icon from '@/src/ui/Icon';
import AnnouncementBar from './AnnouncementBar';
import { useGlobalPromoVisible } from './GlobalPromoBanner';

const LOGOS = {
  company: require('../../assets/as-logo-clear.png'),
  store: require('../../assets/as-store-logo-clear.png')
};

export default function AppHeader({
  brand = 'store',
  title,
  showBack = false,
  onBack,
  search = false,
  bag = false,
  bell = true,
  scrolled = false,
  announcement,
  right // extra custom actions, rendered before the standard ones
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const globalPromoVisible = useGlobalPromoVisible();

  const dark = brand === 'store';
  const fg = dark ? theme.colors.textOnInverse : theme.colors.text;
  // Responsive sizing: tighten on small phones, breathe on wide screens.
  const compact = width < 360;
  const logoW = brand === 'company' ? (compact ? 104 : 128) : compact ? 96 : 116;
  const gutter = width >= 620 ? theme.spacing['2xl'] : theme.layout.screenPadding;

  // Dynamic divider/shadow — animate on the `scrolled` cross so it feels alive.
  const elev = useRef(new Animated.Value(scrolled ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(elev, { toValue: scrolled ? 1 : 0, duration: theme.timing.fast, useNativeDriver: false }).start();
  }, [scrolled, elev, theme.timing.fast]);

  const back = onBack || (() => (router.canGoBack() ? router.back() : router.replace('/')));

  return (
    <View style={[styles.root, dark && styles.rootDark, { paddingTop: globalPromoVisible ? 0 : insets.top }]}>
      {!globalPromoVisible && announcement ? <AnnouncementBar announcement={announcement} /> : null}

      <Animated.View
        style={[
          styles.bar,
          { paddingHorizontal: gutter },
          {
            borderBottomColor: elev.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', dark ? theme.colors.borderOnInverse : theme.colors.border] }),
            shadowOpacity: elev.interpolate({ inputRange: [0, 1], outputRange: [0, dark ? 0.3 : 0.08] }),
            elevation: scrolled ? 4 : 0
          }
        ]}
      >
        {/* Left: back button OR brand logo */}
        {showBack ? (
          <Pressable onPress={back} hitSlop={theme.layout.hitSlop} style={styles.side} accessibilityRole="button" accessibilityLabel="Go back">
            <Icon name="chevronLeft" size={26} color={fg} />
          </Pressable>
        ) : (
          <Pressable onPress={() => router.push(brand === 'company' ? '/company' : '/')} style={styles.brand} accessibilityRole="imagebutton" accessibilityLabel={brand === 'company' ? 'AS Company home' : 'AS Store home'}>
            <Image source={LOGOS[brand]} style={{ width: logoW, height: 34 }} contentFit="contain" />
          </Pressable>
        )}

        {/* Spacer keeps the actions pinned right regardless of the left zone. */}
        <View style={{ flex: 1 }} />

        {/* Center: title, as a centered overlay so it stays optically centered
            no matter the left/right widths. On stack screens it's the primary
            label; on tab screens it fades in only once scrolled (extra context). */}
        {title ? (
          <Animated.View style={[styles.titleWrap, !showBack && { opacity: elev }]} pointerEvents="none">
            <Text variant="title" numberOfLines={1} style={{ color: fg, textAlign: 'center', maxWidth: '62%' }}>
              {title}
            </Text>
          </Animated.View>
        ) : null}

        {/* Right: actions */}
        <View style={styles.actions}>
          {right}
          {bell ? <BellAction color={fg} /> : null}
          {search ? (
            <Pressable onPress={() => router.push('/search')} hitSlop={theme.layout.hitSlop} accessibilityRole="button" accessibilityLabel="Search">
              <Icon name="search" size={22} color={fg} />
            </Pressable>
          ) : null}
          {bag ? <BagAction color={fg} /> : null}
        </View>
      </Animated.View>
    </View>
  );
}

function BellAction({ color }) {
  const theme = useTheme();
  const { unreadCount } = useNotifications();
  return (
    <Pressable onPress={() => router.push('/notifications')} hitSlop={theme.layout.hitSlop} accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
      <Icon name="bell" size={22} color={color} />
      {unreadCount > 0 ? <Badge value={unreadCount > 99 ? '99+' : unreadCount} /> : null}
    </Pressable>
  );
}

function BagAction({ color }) {
  const theme = useTheme();
  const count = useSelector(selectCartCount);
  return (
    <Pressable onPress={() => router.push('/bag')} hitSlop={theme.layout.hitSlop} accessibilityLabel="Bag">
      <Icon name="bag" size={22} color={color} />
      {count > 0 ? <Badge value={count} /> : null}
    </Pressable>
  );
}

function Badge({ value }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.badge}>
      <Text variant="overline" color="textOnPrimary" style={{ fontSize: 10 }}>
        {value}
      </Text>
    </View>
  );
}

const makeStyles = t => ({
  root: { backgroundColor: t.colors.background },
  rootDark: { backgroundColor: t.colors.inverse },
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    // shadow (iOS) — opacity animated; Android uses `elevation`.
    shadowColor: '#0F1111',
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  side: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  titleWrap: { position: 'absolute', left: 56, right: 56, alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: t.spacing.lg },
  badge: {
    position: 'absolute',
    right: -8,
    top: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
