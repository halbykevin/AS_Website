// Product detail — swipeable image gallery, brand/name/price (with sale),
// colour dots, description, specs, and an Add-to-Bag footer that respects the
// 2-per-item cap. Mirrors the AS Store web ProductDetail.

import { useMemo, useState } from 'react'
import { Dimensions, Pressable, ScrollView, View } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useDispatch, useSelector } from 'react-redux'
import { useProduct } from '@/src/lib/queries'
import { addItem, selectCartItems, selectCartCount, MAX_QTY } from '@/src/store/cartSlice'
import { money } from '@/src/lib/format'
import { openUrl, whatsappChatUrl } from '@/src/lib/whatsapp'
import { useContent } from '@/src/content/ContentProvider'
import { useTheme } from '@/src/theme'
import { Screen, Text, Header, Button, Badge, Divider, Icon, Skeleton, EmptyState } from '@/src/ui'
import RemoteImage from '@/src/components/RemoteImage'

const { width: SCREEN_W } = Dimensions.get('window')

export default function ProductDetailScreen() {
  const theme = useTheme()
  const { slug } = useLocalSearchParams()
  const { data: product, isLoading } = useProduct(slug)
  const { storeSettings } = useContent()
  const dispatch = useDispatch()
  const items = useSelector(selectCartItems)
  const [active, setActive] = useState(0)

  const inCart = items.find((i) => i.id === product?.id)?.qty || 0
  const atCap = inCart >= MAX_QTY

  const images = useMemo(() => {
    if (!product) return []
    const list = Array.isArray(product.images) && product.images.length ? product.images : [product.image].filter(Boolean)
    return list
  }, [product])

  if (isLoading) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Product" />
        <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg }}>
          <Skeleton height={SCREEN_W * 0.9} radius="2xl" />
          <Skeleton height={24} width="70%" />
          <Skeleton height={18} width="40%" />
        </View>
      </Screen>
    )
  }

  if (!product) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Product" />
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState icon="box" title="Not found" message="This product isn't available." actionLabel="Back to store" onAction={() => router.replace('/store')} />
        </View>
      </Screen>
    )
  }

  const priceNum = Number(product.price) || 0
  const oldPrice = product.oldPrice ? Number(product.oldPrice) : null
  const onSale = Boolean(oldPrice) && oldPrice > priceNum
  const pct = onSale ? product.salePercent || Math.round((1 - priceNum / oldPrice) * 100) : 0

  const add = () => {
    if (atCap) return
    dispatch(addItem({ id: product.id, title: product.name, image: product.image || images[0], price: priceNum, slug: product.slug }))
  }

  const galleryWidth = Math.min(SCREEN_W, theme.layout.maxContentWidth)

  return (
    <Screen
      edges={['top']}
      contentStyle={{ paddingHorizontal: 0 }}
      footer={
        <View style={{ padding: theme.layout.screenPadding, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
          <View>
            <Text variant="caption" faint>
              {onSale ? 'Now' : 'Price'}
            </Text>
            <Text variant="h3" color={onSale ? 'primary' : 'text'}>
              {money(priceNum)}
            </Text>
          </View>
          <Button
            label={atCap ? 'Max in bag' : 'Add to Bag'}
            icon={atCap ? 'check' : 'bag'}
            onPress={add}
            disabled={atCap}
            size="lg"
            style={{ flex: 1 }}
          />
        </View>
      }
    >
      <Header title={product.category || 'Product'} transparent right={<CartButton />} />

      {/* Gallery */}
      <View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / galleryWidth))}
        >
          {(images.length ? images : ['']).map((img, i) => (
            <View key={i} style={{ width: galleryWidth, aspectRatio: 1, backgroundColor: theme.colors.surfaceAlt }}>
              <RemoteImage uri={img} style={{ width: '100%', height: '100%' }} contentFit="contain" fallbackIcon="box" />
            </View>
          ))}
        </ScrollView>
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
          {onSale ? (
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
        {product.description ? (
          <View>
            <Text variant="h3" style={{ marginBottom: theme.spacing.sm }}>
              Description
            </Text>
            <Text variant="body" muted>
              {product.description}
            </Text>
          </View>
        ) : null}

        {/* Specs */}
        {Array.isArray(product.specs) && product.specs.length ? (
          <View>
            <Text variant="h3" style={{ marginBottom: theme.spacing.sm }}>
              Specifications
            </Text>
            <View style={{ gap: theme.spacing.sm }}>
              {product.specs.map((s, i) => (
                <View key={i}>
                  {i > 0 ? <Divider style={{ marginBottom: theme.spacing.sm }} /> : null}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.lg }}>
                    <Text variant="callout" muted style={{ flex: 1 }}>
                      {s.label || s.name || s.key}
                    </Text>
                    <Text variant="callout" style={{ flex: 1, textAlign: 'right' }}>
                      {s.value ?? (typeof s === 'string' ? s : '')}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Larger quantities via WhatsApp (mirrors the store's max-qty note) */}
        {atCap && storeSettings?.contact?.whatsapp ? (
          <Button
            variant="ghost"
            icon="whatsapp"
            label="Need more? Order on WhatsApp"
            onPress={() => openUrl(whatsappChatUrl(storeSettings.contact.whatsapp, `Hi, I'd like to order more of: ${product.name}`))}
            fullWidth
          />
        ) : null}
      </View>
    </Screen>
  )
}

// Bag shortcut in the header.
function CartButton() {
  const theme = useTheme()
  const count = useSelector(selectCartCount)
  return (
    <Pressable onPress={() => router.push('/cart')} hitSlop={theme.layout.hitSlop}>
      <Icon name="bag" size={22} />
      {count > 0 ? (
        <View style={{ position: 'absolute', right: -8, top: -6, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="overline" color="textOnPrimary" style={{ fontSize: 10 }}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}
