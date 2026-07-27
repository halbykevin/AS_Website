// Store product card — the RN port of the AS Store web ProductTile. Big soft
// red-bordered card, brand eyebrow, name, teaser, image, colour dots, price
// (with sale strike-through) and an Add-to-Bag pill wired to Redux. `fluid`
// fills its grid column; otherwise it's a fixed-width rail card.

import { memo, useMemo } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useDispatch } from 'react-redux';
import { useTheme, useThemedStyles } from '@/src/theme';
import { addItem } from '@/src/store/cartSlice';
import { money } from '@/src/lib/format';
import Text from '@/src/ui/Text';
import Button from '@/src/ui/Button';
import Badge from '@/src/ui/Badge';
import RemoteImage from './RemoteImage';

// --- Fixed geometry ----------------------------------------------------------
// The tile is a FIXED height so the catalog grid can hand FlatList a
// getItemLayout and stop measuring every one of ~1370 cells as it scrolls.
// That only holds if nothing inside can change height, so the two things that
// could are pinned: the text block always reserves its maximum (brand line +
// 2-line name + 2-line teaser), and the colour dots — the one conditional row —
// moved to an overlay on the image.
//
// Heights that come from text are multiplied by the OS font scale rather than
// capped with maxFontSizeMultiplier: someone who has turned their system text
// up still gets it, and the grid reads the same fontScale from
// useWindowDimensions(), so the tile and getItemLayout can never disagree.
const IMAGE_H = 130;
const BUTTON_MIN_H = 36;

// Line heights from the type scale (tokens.js): overline 14, title 23,
// caption 16, callout 20 (the button's label).
const textBlockHeight = f => Math.ceil(14 * f) + 2 + Math.ceil(23 * f) * 2 + 2 + Math.ceil(16 * f) * 2;

export function productTileHeight(fontScale = 1) {
  const f = Math.max(1, fontScale || 1);
  const price = Math.ceil(23 * f); // one line, sale row or "From $x"
  const button = Math.max(BUTTON_MIN_H, Math.ceil(20 * f) + 16); // label + 8pt padding
  return (
    2 + // top + bottom hairline border
    12 + // card padding top
    textBlockHeight(f) +
    8 +
    IMAGE_H + // imageWrap marginTop + height
    12 +
    price +
    8 +
    button + // footer marginTop + price + button marginTop + button
    12 // card padding bottom
  );
}

function ProductTile({ product, fluid = false, width }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const dispatch = useDispatch();
  const { fontScale } = useWindowDimensions();
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
    <View style={[styles.card, { height: productTileHeight(fontScale) }, fluid ? { width: '100%' } : { width: width || 260 }]}>
      {onSale ? <Badge label={`−${pct}%`} tone="primary" style={styles.saleBadge} /> : null}

      <Pressable onPress={open} style={[styles.textBlock, { height: textBlockHeight(Math.max(1, fontScale || 1)) }]}>
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
        {/* Overlaid rather than stacked in the footer: as a flow row it was the
            only part of the tile that appeared conditionally, which made the
            height vary and getItemLayout impossible. */}
        {colors.length > 0 ? (
          <View style={styles.dots} pointerEvents="none">
            {colors.slice(0, 5).map((c, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: c }]} />
            ))}
          </View>
        ) : null}
      </Pressable>

      <View style={styles.footer}>
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
  // Height is set inline from the font scale — see productTileHeight.
  textBlock: { overflow: 'hidden' },
  imageWrap: {
    marginTop: t.spacing.sm,
    height: IMAGE_H,
    borderRadius: t.radii.xl,
    overflow: 'hidden',
    backgroundColor: t.colors.surfaceAlt
  },
  image: { width: '100%', height: '100%' },
  footer: { marginTop: t.spacing.md },
  dots: { position: 'absolute', left: t.spacing.sm, bottom: t.spacing.sm, flexDirection: 'row', gap: 6 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.sm },
  strike: { textDecorationLine: 'line-through' }
});

// Memoized: inside virtualized lists the tile only re-renders when its product
// actually changes, not on every parent render.
export default memo(ProductTile, (prev, next) => prev.product === next.product && prev.fluid === next.fluid && prev.width === next.width);
