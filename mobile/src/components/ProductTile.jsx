// Store product card — the RN port of the AS Store web ProductTile. Big soft
// red-bordered card, brand eyebrow, name, teaser, image, colour dots, price
// (with sale strike-through) and an Add-to-Bag pill wired to Redux. `fluid`
// fills its grid column; otherwise it's a fixed-width rail card.

import { memo, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useDispatch } from 'react-redux';
import { useTheme, useThemedStyles } from '@/src/theme';
import { addItem } from '@/src/store/cartSlice';
import { money } from '@/src/lib/format';
import Text from '@/src/ui/Text';
import Button from '@/src/ui/Button';
import Badge from '@/src/ui/Badge';
import RemoteImage from './RemoteImage';

function ProductTile({ product, fluid = false, width }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const dispatch = useDispatch();
  const { id, name, tagline, price, image, colors = [], brand, slug } = product;

  const priceNum = Number(price) || 0;
  const oldPrice = product.oldPrice ? Number(product.oldPrice) : null;
  const onSale = Boolean(oldPrice) && oldPrice > priceNum;
  const pct = onSale ? product.salePercent || Math.round((1 - priceNum / oldPrice) * 100) : 0;

  // Teaser: first real paragraph of the description, else the tagline.
  const teaser = useMemo(() => {
    return (
      String(product.description || '')
        .split(/\n{2,}/)
        .map(b => b.trim())
        .find(b => b && !b.startsWith('#') && !b.startsWith('-') && !b.startsWith('*'))
        ?.replace(/[*_`]/g, '') ||
      tagline ||
      ''
    );
  }, [product.description, tagline]);

  const open = () => slug && router.push(`/product/${slug}`);
  const add = () => dispatch(addItem({ id, title: name, image, price: priceNum, slug }));

  return (
    <View style={[styles.card, fluid ? { width: '100%' } : { width: width || 260 }]}>
      {onSale ? <Badge label={`−${pct}%`} tone="primary" style={styles.saleBadge} /> : null}

      <Pressable onPress={open} style={styles.textBlock}>
        <Text variant="overline" color="primary" numberOfLines={1}>
          {(brand || 'New').toUpperCase()}
        </Text>
        <Text variant="title" numberOfLines={2} style={{ marginTop: 2 }}>
          {name}
        </Text>
        {teaser ? (
          <Text variant="caption" muted numberOfLines={2} style={{ marginTop: 2 }}>
            {teaser}
          </Text>
        ) : null}
      </Pressable>

      <Pressable onPress={open} style={styles.imageWrap}>
        <RemoteImage uri={image} style={styles.image} contentFit="contain" fallbackIcon="box" />
      </Pressable>

      <View style={styles.footer}>
        {colors.length > 0 ? (
          <View style={styles.dots}>
            {colors.slice(0, 5).map((c, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: c }]} />
            ))}
          </View>
        ) : null}

        {onSale ? (
          <View style={styles.priceRow}>
            <Text variant="title" color="primary">
              {money(priceNum)}
            </Text>
            <Text variant="caption" faint style={styles.strike}>
              {money(oldPrice)}
            </Text>
          </View>
        ) : (
          <Text variant="title">From {money(priceNum)}</Text>
        )}

        <Button label="Add to Bag" onPress={add} size="sm" fullWidth style={{ marginTop: theme.spacing.sm }} />
      </View>
    </View>
  );
}

const makeStyles = t => ({
  card: {
    borderRadius: t.radii['3xl'],
    borderWidth: 1,
    borderColor: t.colors.primary,
    backgroundColor: t.colors.surface,
    padding: t.spacing.md,
    ...t.shadows.card
  },
  saleBadge: { position: 'absolute', right: t.spacing.md, top: t.spacing.md, zIndex: 2 },
  textBlock: { minHeight: 72 },
  imageWrap: {
    marginTop: t.spacing.sm,
    height: 130,
    borderRadius: t.radii.xl,
    overflow: 'hidden',
    backgroundColor: t.colors.surfaceAlt
  },
  image: { width: '100%', height: '100%' },
  footer: { marginTop: t.spacing.md },
  dots: { flexDirection: 'row', gap: 6, marginBottom: t.spacing.sm },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.sm },
  strike: { textDecorationLine: 'line-through' }
});

// Memoized: inside virtualized lists the tile only re-renders when its product
// actually changes, not on every parent render.
export default memo(ProductTile, (prev, next) => prev.product === next.product && prev.fluid === next.fluid && prev.width === next.width);
