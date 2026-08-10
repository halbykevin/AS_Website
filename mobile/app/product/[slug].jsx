import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { useProduct } from '@/src/lib/queries';
import { addItem, selectCartItems, selectCartCount, MAX_QTY } from '@/src/store/cartSlice';
import { money, normalizeSpecs, cleanDescription } from '@/src/lib/format';
import { openUrl, whatsappChatUrl } from '@/src/lib/whatsapp';
import { useContent } from '@/src/content/ContentProvider';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Button, Badge, Divider, Icon, Skeleton, EmptyState, Accordion, Markdown } from '@/src/ui';
import RemoteImage from '@/src/components/RemoteImage';
import ImageViewer from '@/src/components/ImageViewer';
import PointsEarn from '@/src/components/PointsEarn';
import { isCallForPrice, callForPriceCopy, enquiryUrl } from '@/src/lib/callForPrice';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

// Below this the spec table's two columns get too narrow to read and it stacks
// each row instead. Measured against the tightest phone we support (320pt),
// which leaves ~248pt inside the screen gutters and the card's own padding.
const SPEC_STACK_BELOW = 360;

export default function ProductDetailScreen() {
  const theme = useTheme();
  // Read live rather than captured at import: the gallery pages are sized from
  // it, so a rotation or a foldable unfolding has to re-page them.
  const { width: screenWidth } = useWindowDimensions();
  const { slug } = useLocalSearchParams();
  const { data: product, isLoading } = useProduct(slug);
  const { storeSettings } = useContent();
  const dispatch = useDispatch();
  const items = useSelector(selectCartItems);
  const [active, setActive] = useState(0);
  // Index of the photo the lightbox is showing; null when it's closed. The
  // close handler is memoised because the viewer feeds it into its gesture
  // definitions — a fresh identity each render would reattach the native
  // handlers underneath a live pinch.
  const [viewerAt, setViewerAt] = useState(null);
  const closeViewer = useCallback(() => setViewerAt(null), []);

  const inCart = items.find(i => i.id === product?.id)?.qty || 0;
  const atCap = inCart >= MAX_QTY;

  const images = useMemo(() => {
    if (!product) return [];
    const list = Array.isArray(product.images) && product.images.length ? product.images : [product.image].filter(Boolean);
    return list;
  }, [product]);

  // The API sends specs as [label, value] pairs and descriptions that can carry
  // citation markers and raw URLs — normalise both before they reach the render.
  const specs = useMemo(() => normalizeSpecs(product?.specs), [product?.specs]);
  const description = useMemo(() => cleanDescription(product?.description), [product?.description]);

  if (isLoading) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Product" />
        <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg }}>
          <Skeleton height={screenWidth * 0.9} radius="2xl" />
          <Skeleton height={24} width="70%" />
          <Skeleton height={18} width="40%" />
        </View>
      </Screen>
    );
  }

  if (!product) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Product" />
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState icon="box" title="Not found" message="This product isn't available." actionLabel="Back to store" onAction={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }

  // Price-hidden product: no price anywhere, no bag, no points estimate — just
  // the enquiry. The server refuses to sell these, so the app must not offer to.
  const quoteOnly = isCallForPrice(product);
  const cfp = callForPriceCopy(storeSettings);

  const priceNum = Number(product.price) || 0;
  const oldPrice = product.oldPrice ? Number(product.oldPrice) : null;
  const onSale = Boolean(oldPrice) && oldPrice > priceNum;
  const pct = onSale ? product.salePercent || Math.round((1 - priceNum / oldPrice) * 100) : 0;

  const add = () => {
    if (atCap) return;
    dispatch(addItem({ id: product.id, title: product.name, image: product.image || images[0], price: priceNum, slug: product.slug }));
  };

  const galleryWidth = Math.min(screenWidth, theme.layout.maxContentWidth);

  return (
    <Screen
      edges={['top']}
      contentStyle={{ paddingHorizontal: 0 }}
      footer={
        <View style={{ padding: theme.layout.screenPadding, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
          {quoteOnly ? (
            <>
              <View style={{ flexShrink: 1 }}>
                <Text variant="caption" faint>
                  Price
                </Text>
                <Text variant="h3" color="primary" numberOfLines={1}>
                  {cfp.label}
                </Text>
              </View>
              <Button
                label={cfp.button}
                icon="whatsapp"
                onPress={() => openUrl(enquiryUrl(product, storeSettings))}
                disabled={!enquiryUrl(product, storeSettings)}
                size="lg"
                style={{ flex: 1 }}
              />
            </>
          ) : (
            <>
              <View>
                <Text variant="caption" faint>
                  {onSale ? 'Now' : 'Price'}
                </Text>
                <Text variant="h3" color={onSale ? 'primary' : 'text'}>
                  {money(priceNum)}
                </Text>
              </View>
              <Button label={atCap ? 'Max in bag' : 'Add to Bag'} icon={atCap ? 'check' : 'bag'} onPress={add} disabled={atCap} size="lg" style={{ flex: 1 }} />
            </>
          )}
        </View>
      }
    >
      <Header title={product.category || 'Product'} transparent right={<CartButton />} />

      {/* Gallery */}
      <View>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={e => setActive(Math.round(e.nativeEvent.contentOffset.x / galleryWidth))}>
          {(images.length ? images : ['']).map((img, i) => (
            <Pressable
              key={i}
              onPress={() => img && setViewerAt(i)}
              disabled={!img}
              style={{ width: galleryWidth, aspectRatio: 1, backgroundColor: theme.colors.productMedia }}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${product.name}, photo ${i + 1} of ${images.length || 1}`}
              accessibilityHint="Opens full screen, where you can zoom"
            >
              <RemoteImage uri={img} style={{ width: '100%', height: '100%' }} contentFit="contain" fallbackIcon="box" fallbackBackground={theme.colors.surfaceAlt} />
            </Pressable>
          ))}
        </ScrollView>

        {/* Tapping a photo isn't discoverable on its own, so say so quietly. */}
        {images.length ? (
          <View style={{ position: 'absolute', right: theme.spacing.md, top: theme.spacing.md, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.alpha(theme.colors.text, 0.08) }} pointerEvents="none">
            <Icon name="expand" size={17} color={theme.colors.textMuted} />
          </View>
        ) : null}
        {images.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: theme.spacing.md }}>
            {images.map((_, i) => (
              <View key={i} style={{ width: i === active ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: i === active ? theme.colors.primary : theme.colors.border }} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
        {product.brand ? (
          <Text variant="overline" color="primary">
            {product.brand.toUpperCase()}
          </Text>
        ) : null}
        <Text variant="h1">{product.name}</Text>
        {product.tagline ? (
          <Text variant="bodyLg" muted>
            {product.tagline}
          </Text>
        ) : null}

        {/* Price */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          {quoteOnly ? (
            <Text variant="h2" color="primary">
              {cfp.label}
            </Text>
          ) : onSale ? (
            <>
              <Text variant="h2" color="primary">
                {money(priceNum)}
              </Text>
              <Text variant="title" faint style={{ textDecorationLine: 'line-through' }}>
                {money(oldPrice)}
              </Text>
              <Badge label={`−${pct}%`} tone="primary" />
            </>
          ) : (
            <Text variant="h2">{money(priceNum)}</Text>
          )}
        </View>

        {/* No price, no points estimate — there is no figure to earn on. */}
        {quoteOnly ? (
          cfp.note ? (
            <Text variant="caption" muted>
              {cfp.note}
            </Text>
          ) : null
        ) : (
          <PointsEarn amount={priceNum} verb="Earn" />
        )}

        {/* Colours */}
        {Array.isArray(product.colors) && product.colors.length ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="callout" muted>
              Colours
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              {product.colors.map((c, i) => (
                <View key={i} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: 1, borderColor: theme.colors.border }} />
              ))}
            </View>
          </View>
        ) : null}

        {/* Stock */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={product.stock > 0 ? 'checkCircle' : 'info'} size={16} color={product.stock > 0 ? theme.colors.success : theme.colors.textFaint} />
          <Text variant="caption" muted>
            {product.stock > 0 ? 'In stock · Cash on delivery' : 'Made to order'}
          </Text>
        </View>

        <Divider />

        {/* Description */}
        {/* Description opens by default — it's what the shopper came to read.
            Specifications stay closed so the page below the fold is scannable
            rather than a wall of rows; both are one prop to flip. */}
        {description ? (
          <Accordion title="Description" defaultExpanded>
            {/* Catalog copy is light markdown — headings and bullet lists — so
                it goes through the renderer rather than into one flat string. */}
            <Markdown text={description} />
          </Accordion>
        ) : null}

        {/* Specs */}
        {specs.length ? (
          <Accordion title="Specifications" count={specs.length}>
            <View>
              {specs.map((s, i) => (
                <View key={`${s.label}-${i}`}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ paddingVertical: theme.spacing.sm }}>
                    <SpecRow label={s.label} value={s.value} stacked={screenWidth < SPEC_STACK_BELOW} />
                  </View>
                </View>
              ))}
            </View>
          </Accordion>
        ) : null}

        {/* Larger quantities via WhatsApp (mirrors the store's max-qty note) */}
        {atCap && storeSettings?.contact?.whatsapp ? <Button variant="ghost" icon="whatsapp" label="Need more? Order on WhatsApp" onPress={() => openUrl(whatsappChatUrl(storeSettings.contact.whatsapp, `Hi, I'd like to order more of: ${product.name}`))} fullWidth /> : null}
      </View>

      <ImageViewer images={images} index={viewerAt ?? 0} visible={viewerAt !== null} onClose={closeViewer} />
    </Screen>
  );
}

// One row of the spec table. Side by side the label takes a fixed share and the
// value claims the rest, right-aligned — an even 50/50 split left short labels
// like "Color" swimming in space while values like "Apple M5 Pro – 18‑Core CPU"
// wrapped to three ragged right-aligned lines. On a narrow screen there isn't
// room for two columns at all, so the label sits above the value instead.
function SpecRow({ label, value, stacked }) {
  const theme = useTheme();

  if (!label) {
    return <Text variant="callout">{value}</Text>;
  }

  if (stacked) {
    return (
      <View style={{ gap: 2 }}>
        <Text variant="caption" muted>
          {label}
        </Text>
        <Text variant="callout">{value}</Text>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.lg }}>
      <Text variant="callout" muted style={{ flexGrow: 0, flexShrink: 1, flexBasis: '38%' }}>
        {label}
      </Text>
      <Text variant="callout" style={{ flex: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

// Bag shortcut in the header.
function CartButton() {
  const theme = useTheme();
  const count = useSelector(selectCartCount);
  return (
    <Pressable onPress={() => router.push('/bag')} hitSlop={theme.layout.hitSlop}>
      <Icon name="bag" size={22} />
      {count > 0 ? (
        <View style={{ position: 'absolute', right: -8, top: -6, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="overline" color="textOnPrimary" style={{ fontSize: 10 }}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
