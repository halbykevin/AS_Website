// Top brand bar for the main tab screens: the logo on the left, action icons
// (search / bag) on the right. Keeps the two home screens visually anchored.

import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTheme, useThemedStyles } from '@/src/theme';
import { selectCartCount } from '@/src/store/cartSlice';
import Icon from '@/src/ui/Icon';
import Text from '@/src/ui/Text';

const LOGOS = {
  company: require('../../assets/as-company-logo.jpg'),
  store: require('../../assets/as-store-logo-clear.png')
};

export default function BrandBar({ variant = 'company', showSearch = false, showBag = false, title }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const cartCount = useSelector(selectCartCount);

  return (
    <View style={styles.bar}>
      <Pressable onPress={() => router.push('/')} style={styles.logoWrap}>
        <Image source={LOGOS[variant]} style={styles.logo} contentFit="contain" />
        {title ? (
          <Text variant="title" style={{ marginLeft: 8 }}>
            {title}
          </Text>
        ) : null}
      </Pressable>

      <View style={styles.actions}>
        {showSearch ? (
          <Pressable onPress={() => router.push('/search')} hitSlop={theme.layout.hitSlop} style={styles.action}>
            <Icon name="search" size={22} />
          </Pressable>
        ) : null}
        {showBag ? (
          <Pressable onPress={() => router.push('/bag')} hitSlop={theme.layout.hitSlop} style={styles.action}>
            <Icon name="bag" size={22} />
            {cartCount > 0 ? (
              <View style={styles.badge}>
                <Text variant="overline" color="textOnPrimary" style={{ fontSize: 10 }}>
                  {cartCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = t => ({
  bar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.layout.screenPadding
  },
  logoWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  logo: { height: 34, width: 120 },
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
