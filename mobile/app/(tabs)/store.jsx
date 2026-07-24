// Store tab — the AS Store home: announcement, a "new in" rail, category tiles,
// a featured rail and the full product grid. Gated by settings.published (shows
// Coming Soon when the store isn't live yet).

import { useMemo } from 'react'
import { RefreshControl, View } from 'react-native'
import { router } from 'expo-router'
import { useContent } from '@/src/content/ContentProvider'
import { useProducts, useCategories } from '@/src/lib/queries'
import { useTheme } from '@/src/theme'
import { Screen, Text, SectionHeader } from '@/src/ui'
import BrandBar from '@/src/components/BrandBar'
import AnnouncementBar from '@/src/components/AnnouncementBar'
import ComingSoon from '@/src/components/ComingSoon'
import ProductTile from '@/src/components/ProductTile'
import ProductGrid from '@/src/components/ProductGrid'
import CategoryTile from '@/src/components/CategoryTile'
import HRail from '@/src/components/HRail'

export default function StoreScreen() {
  const theme = useTheme()
  const { storeSettings, refresh: refreshContent } = useContent()

  const all = useProducts({})
  const featured = useProducts({ featured: 1, limit: 10 })
  const newIn = useProducts({ limit: storeSettings?.homeNew?.count || 8 })
  const cats = useCategories()

  const loading = all.isLoading
  const products = all.data || []

  const onRefresh = () => {
    refreshContent()
    all.refetch()
    featured.refetch()
    newIn.refetch()
    cats.refetch()
  }

  // Top-level categories only (no parent) for the tile row.
  const topCats = useMemo(() => (cats.data || []).filter((c) => !c.parentId).slice(0, 6), [cats.data])

  if (storeSettings && storeSettings.published === false) {
    return (
      <Screen edges={['top']} scroll={false} padded={false}>
        <ComingSoon settings={storeSettings} />
      </Screen>
    )
  }

  return (
    <Screen
      edges={['top']}
      contentStyle={{ paddingHorizontal: 0 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      <AnnouncementBar announcement={storeSettings?.announcement} />
      <BrandBar variant="store" showSearch showBag />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing['3xl'], paddingTop: theme.spacing.sm }}>
        {/* Hero copy */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="primary">
            {(storeSettings?.homeNew?.eyebrow || 'AS STORE').toUpperCase()}
          </Text>
          <Text variant="display">{storeSettings?.homeNew?.heading || 'The best of tech.'}</Text>
          <Text variant="bodyLg" muted>
            Curated, genuine and delivered across Lebanon.
          </Text>
        </View>

        {/* New in rail */}
        {(newIn.data || []).length > 0 ? (
          <View>
            <SectionHeader title={storeSettings?.homeNew?.heading || 'New in'} actionLabel="Shop all" onAction={() => router.push('/category/all')} />
            <HRail data={newIn.data} itemWidth={220} renderItem={(p) => <ProductTile product={p} width={220} />} />
          </View>
        ) : null}

        {/* Category tiles */}
        {topCats.length > 0 ? (
          <View>
            <SectionHeader title="Shop by category" />
            <View style={{ gap: theme.spacing.md }}>
              {chunkPairs(topCats).map((pair, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                  {pair.map((c) => (
                    <View key={c.id} style={{ flex: 1 }}>
                      <CategoryTile category={c} onPress={() => router.push(`/category/${c.slug}`)} />
                    </View>
                  ))}
                  {pair.length < 2 ? <View style={{ flex: 1 }} /> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Featured rail */}
        {(featured.data || []).length > 0 ? (
          <View>
            <SectionHeader eyebrow="Featured" title="Editor's picks" />
            <HRail data={featured.data} itemWidth={220} renderItem={(p) => <ProductTile product={p} width={220} />} />
          </View>
        ) : null}

        {/* All products grid */}
        <View>
          <SectionHeader title="All products" />
          <ProductGrid products={products} loading={loading} emptyMessage="No products yet. Pull to refresh." />
        </View>
      </View>
    </Screen>
  )
}

const chunkPairs = (arr) => {
  const out = []
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2))
  return out
}
