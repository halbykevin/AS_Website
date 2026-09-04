import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTheme, useThemedStyles } from '@/src/theme';
import { selectCartCount } from '@/src/store/cartSlice';
import { useNotifications } from '@/src/lib/notifications';
import Text from '@/src/ui/Text';
import Icon from '@/src/ui/Icon';
import AnnouncementBar from './AnnouncementBar';
import { useGlobalPromoVisible } from './GlobalPromoBanner';
import { useCartTarget } from './FlyToCart';

const LOGOS = {
  company: require('../../assets/as-logo.jpg'),
  store: require('../../assets/as-store-logo-clear.png')
};

const LOGO_ASPECT = { company: 1, store: 1.5 };

export default function AppHeader({
  brand = 'store',
  title,
  showBack = false,
  onBack,
  search = false,
  assistant = false,
  bag = false,
  bell = true,
  scrolled = false,
  announcement,
  right
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const globalPromoVisible = useGlobalPromoVisible();

  const dark = brand === 'store';
  const fg = dark ? theme.colors.textOnInverse : theme.colors.text;
  const compact = width < 360;
  const logoH = compact ? 36 : 42;
  const logoW = logoH * LOGO_ASPECT[brand];
  const gutter = width >= 620 ? theme.spacing['2xl'] : theme.layout.screenPadding;

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
        {showBack ? (
          <Pressable onPress={back} hitSlop={theme.layout.hitSlop} style={styles.side} accessibilityRole="button" accessibilityLabel="Go back">
            <Icon name="chevronLeft" size={26} color={fg} />
          </Pressable>
        ) : (
          <Pressable onPress={() => router.push(brand === 'company' ? '/company' : '/')} style={styles.brand} accessibilityRole="imagebutton" accessibilityLabel={brand === 'company' ? 'AS Company home' : 'AS Store home'}>
            <Image source={LOGOS[brand]} style={{ width: logoW, height: logoH }} contentFit="contain" />
          </Pressable>
        )}

        <View style={{ flex: 1 }} />

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
          {/* The shopping assistant — the app's answer to the website's chat
              bubble. A header action rather than a floating button: a bubble on
              a phone lands either on the tab bar or on a product tile. */}
          {assistant ? (
            <Pressable onPress={() => router.push('/assistant')} hitSlop={theme.layout.hitSlop} accessibilityRole="button" accessibilityLabel="Ask the assistant">
              <Icon name="sparkles" size={22} color={fg} />
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
  // Where an Add-to-Bag flight lands while this header is up.
  //
  // Without this it aimed at the tab bar's bag — which is right on a tab, and
  // wrong the moment a screen is pushed OVER the tabs (a category, search): the
  // tab bar isn't on screen, so the photo flew past the bottom edge to a bag
  // nobody could see, while the only visible bag sat in this header doing
  // nothing. Registrations are a stack, so this claims the spot while the
  // header is mounted and hands it straight back on unmount — the same trick
  // the product screen's bag button already used. See FlyToCart.
  const ref = useCartTarget('header:bag', useIsFocused());
  return (
    <Pressable ref={ref} collapsable={false} onPress={() => router.push('/bag')} hitSlop={theme.layout.hitSlop} accessibilityLabel="Bag">
      <Icon name="bag" size={22} color={color} />
      {count > 0 ? <Badge value={count} /> : null}
    </Pressable>
  );
}

// Is the screen this header belongs to the one on screen? A tab stays mounted
// after you leave it, so mounting is not the answer — see useCartTarget.
function useIsFocused() {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  return focused;
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
