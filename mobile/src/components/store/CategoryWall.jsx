// "Shop by category" — the RN port of the AS Store web <CategoryWall>: a
// full-bleed dark "ink" section with an eyebrow + big heading and a "View
// everything" link, over a 2-up grid of tall 4:5 image tiles. Each tile has a
// bottom-up gradient, a rotated corner arrow badge and the category name +
// tagline pinned bottom-left. Matches the website's look on mobile.

import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTheme, useThemedStyles } from '@/src/theme';
import Text from '@/src/ui/Text';
import Icon from '@/src/ui/Icon';
import RemoteImage from '@/src/components/RemoteImage';

export default function CategoryWall({ categories = [], eyebrow = 'Find your thing', heading = 'Shop by category.', onViewAll = () => router.push('/category/all'), style }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!categories.length) return null;

  return (
    <View style={[styles.section, style]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
          <Text variant="overline" style={styles.eyebrow}>
            {eyebrow.toUpperCase()}
          </Text>
          <Text variant="h1" color="textOnInverse" style={{ marginTop: 6 }}>
            {heading}
          </Text>
        </View>
        <Pressable onPress={onViewAll} hitSlop={theme.layout.hitSlop} style={styles.viewAll} accessibilityRole="button">
          <Text variant="callout" color="textOnInverseMuted">
            View everything
          </Text>
          <Icon name="chevronRight" size={16} color={theme.colors.primaryLight} />
        </Pressable>
      </View>

      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.watermark}>
        CATEGORIES
      </Text>

      <View style={styles.grid}>
        {categories.map(c => (
          <View key={c.id ?? c.slug} style={styles.cell}>
            <Tile category={c} />
          </View>
        ))}
      </View>
    </View>
  );
}

function Tile({ category }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={() => router.push(`/category/${category.slug}`)} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]} accessibilityRole="button" accessibilityLabel={category.name}>
      <RemoteImage uri={category.image} style={styles.img} contentFit="cover" fallbackIcon="grid" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.82)']} locations={[0, 0.45, 1]} style={styles.gradient} />

      <View style={styles.arrow}>
        <Icon name="arrowRight" size={16} color={theme.colors.white} />
      </View>

      <View style={styles.label}>
        <Text variant="title" color="textOnInverse" numberOfLines={1}>
          {category.name}
        </Text>
        {category.tagline ? (
          <Text variant="caption" color="textOnInverseMuted" numberOfLines={1} style={{ marginTop: 2 }}>
            {category.tagline}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = t => ({
  section: {
    backgroundColor: t.colors.inverse,
    paddingHorizontal: t.layout.screenPadding,
    paddingVertical: t.spacing['3xl'],
    borderRadius: t.radii['3xl'],
    overflow: 'hidden'
  },
  watermark: {
    position: 'absolute',
    top: -22,
    left: -8,
    color: 'rgba(255,255,255,0.035)',
    fontSize: 72,
    lineHeight: 80,
    fontWeight: '900',
    letterSpacing: -3
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: t.spacing.xl },
  eyebrow: { color: t.colors.primaryLight, letterSpacing: 1.5 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md },
  // Two columns; the gap is subtracted so both cells fit the row exactly.
  cell: { width: '48%', flexGrow: 1 },
  tile: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: t.radii['2xl'],
    overflow: 'hidden',
    backgroundColor: t.colors.inverseSoft
  },
  img: { ...absoluteFill() },
  gradient: { ...absoluteFill() },
  arrow: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    transform: [{ rotate: '-45deg' }]
  },
  label: { position: 'absolute', left: t.spacing.lg, right: t.spacing.lg, bottom: t.spacing.lg }
});

function absoluteFill() {
  return { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
}
