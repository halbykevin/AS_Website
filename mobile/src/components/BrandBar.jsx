// Top brand bar for the main tab screens: the logo on the left, the screen
// title optically centred, action icons (bell / search / bag) on the right.
//
// It deliberately mirrors AppHeader's proportions — same 56dp bar, same
// responsive gutter, same logo sizing — so the store's tab screens and its
// stack screens read as one header rather than two near-misses. The difference
// that earns it a separate component: this title is always visible, where
// AppHeader's fades in on scroll.

import { Pressable, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTheme, useThemedStyles } from '@/src/theme';
import { selectCartCount } from '@/src/store/cartSlice';
import { useNotifications } from '@/src/lib/notifications';
import Icon from '@/src/ui/Icon';
import Text from '@/src/ui/Text';

const LOGOS = {
  company: require('../../assets/as-logo.jpg'),
  store: require('../../assets/as-store-logo-clear.png')
};

// Box = the artwork's own aspect, so `contain` has no slack to centre the mark
// inside and it lands flush on the gutter. Keep in step with AppHeader.
const LOGO_ASPECT = { company: 1, store: 1.5 };

export default function BrandBar({ variant = 'company', showSearch = false, showBag = false, showBell = true, title }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const cartCount = useSelector(selectCartCount);
  const { unreadCount } = useNotifications();

  const compact = width < 360;
  const logoH = compact ? 36 : 42;
  const logoW = logoH * LOGO_ASPECT[variant];
  const gutter = width >= 620 ? theme.spacing['2xl'] : theme.layout.screenPadding;

  return (
    <View style={[styles.bar, { paddingHorizontal: gutter }]}>
      <Pressable
        onPress={() => router.push(variant === 'company' ? '/company' : '/')}
        style={styles.brand}
        accessibilityRole="imagebutton"
        accessibilityLabel={variant === 'company' ? 'AS Company home' : 'AS Store home'}
      >
        <Image source={LOGOS[variant]} style={{ width: logoW, height: logoH }} contentFit="contain" />
      </Pressable>

      {/* Spacer keeps the actions pinned right regardless of the left zone. */}
      <View style={{ flex: 1 }} />

      {/* Centred overlay, so the title stays optically centred whatever the logo
          and action widths are — and so tapping it is no longer a tap on the
          logo, which used to bounce you to the home screen. */}
      {title ? (
        <View style={styles.titleWrap} pointerEvents="none">
          <Text variant="title" numberOfLines={1} style={{ textAlign: 'center', maxWidth: '62%' }}>
            {title}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {showBell ? (
          <Pressable
            onPress={() => router.push('/notifications')}
            hitSlop={theme.layout.hitSlop}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <Icon name="bell" size={22} />
            {unreadCount > 0 ? <Badge value={unreadCount > 99 ? '99+' : unreadCount} /> : null}
          </Pressable>
        ) : null}
        {showSearch ? (
          <Pressable
            onPress={() => router.push('/search')}
            hitSlop={theme.layout.hitSlop}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Icon name="search" size={22} />
          </Pressable>
        ) : null}
        {showBag ? (
          <Pressable
            onPress={() => router.push('/bag')}
            hitSlop={theme.layout.hitSlop}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel="Bag"
          >
            <Icon name="bag" size={22} />
            {cartCount > 0 ? <Badge value={cartCount} /> : null}
          </Pressable>
        ) : null}
      </View>
    </View>
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
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center'
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  titleWrap: { position: 'absolute', left: 56, right: 56, alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg },
  action: { padding: 2 },
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
