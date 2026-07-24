// Home tab — the AS Store storefront, front and center. Announcement, search,
// category chips, hot deals, "new in" + featured rails, the full product grid,
// plus compact entry points to the predictor game and the company page.
// Gated by settings.published (Coming Soon when the store isn't live).

import { useMemo } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { useContent } from '@/src/content/ContentProvider'
import { useProducts, useCategories } from '@/src/lib/queries'
import { useTheme } from '@/src/theme'
import { Screen, Text, Card, Chip, Icon, SectionHeader } from '@/src/ui'
import BrandBar from '@/src/components/BrandBar'
import AnnouncementBar from '@/src/components/AnnouncementBar'
import ComingSoon from '@/src/components/ComingSoon'
import SearchPill from '@/src/components/SearchPill'
import ProductTile from '@/src/components/ProductTile'
import ProductGrid from '@/src/components/ProductGrid'
import HRail from '@/src/components/HRail'

export default function HomeScreen() {
  const theme = useTheme()
  const { content, storeSettings, refresh: refreshContent } = useContent()

  const all = useProducts({})
  const featured = useProducts({ featured: 1, limit: 10 })
  const newIn = useProducts({ limit: storeSettings?.homeNew?.count || 8 })
  const cats = useCategories()

  const loading = all.isLoading
  const products = all.data || []
  const predictor = content.predictor

  const onRefresh = () => {
    refreshContent()
    all.refetch()
    featured.refetch()
    newIn.refetch()
    cats.refetch()
  }

  // Top-level categories drive the quick chips row.
  const topCats = useMemo(() => (cats.data || []).filter((c) => !c.parentId), [cats.data])

  // Running promotions — anything the API priced down.
  const deals = useMemo(
    () => products.filter((p) => p.salePercent || (p.oldPrice && Number(p.oldPrice) > Number(p.price))),
    [products],
  )

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
      <BrandBar variant="store" />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing['2xl'], paddingTop: theme.spacing.xs }}>
        {/* Search */}
        <SearchPill />

        {/* Hero copy */}
        <View style={{ gap: 4 }}>
          <Text variant="overline" color="primary">
            {(storeSettings?.homeNew?.eyebrow || 'AS STORE').toUpperCase()}
          </Text>
          <Text variant="display">{storeSettings?.homeNew?.heading || 'The best of tech.'}</Text>
          <Text variant="bodyLg" muted>
            Curated, genuine and delivered across Lebanon.
          </Text>
        </View>

        {/* Category quick chips */}
        {topCats.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -theme.layout.screenPadding }}
            contentContainerStyle={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.sm }}
          >
            <Chip label="All" selected onPress={() => router.push('/category/all')} />
            {topCats.map((c) => (
              <Chip key={c.id} label={c.name} onPress={() => router.push(`/category/${c.slug}`)} />
            ))}
          </ScrollView>
        ) : null}

        {/* Hot deals — dark spotlight section, only when a promotion is running */}
        {deals.length > 0 ? (
          <View
            style={{
              backgroundColor: theme.colors.inverse,
              borderRadius: theme.radii['3xl'],
              padding: theme.spacing.lg,
              marginHorizontal: -theme.spacing.xs,
            }}
          >
            <SectionHeader eyebrow="Limited time" title="Hot deals" onInverse style={{ marginBottom: theme.spacing.md }} />
            <HRail
              data={deals.slice(0, 10)}
              itemWidth={220}
              edgePadding={theme.spacing.lg}
              renderItem={(p) => <ProductTile product={p} width={220} />}
            />
          </View>
        ) : null}

        {/* New in rail */}
        {(newIn.data || []).length > 0 ? (
          <View>
            <SectionHeader
              eyebrow={storeSettings?.homeNew?.eyebrow}
              title={storeSettings?.homeNew?.heading || 'New in'}
              actionLabel="Shop all"
              onAction={() => router.push('/category/all')}
            />
            <HRail data={newIn.data} itemWidth={220} renderItem={(p) => <ProductTile product={p} width={220} />} />
          </View>
        ) : null}

        {/* Featured rail */}
        {(featured.data || []).length > 0 ? (
          <View>
            <SectionHeader eyebrow="Featured" title="Editor's picks" />
            <HRail data={featured.data} itemWidth={220} renderItem={(p) => <ProductTile product={p} width={220} />} />
          </View>
        ) : null}

        {/* Predictor teaser */}
        {predictor && !predictor.closed ? (
          <Card onPress={() => router.push('/predictor')} radius="3xl" style={{ backgroundColor: theme.colors.primary }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
              <Icon name="basketball" size={36} color={theme.colors.white} />
              <View style={{ flex: 1 }}>
                <Text variant="overline" color="textOnPrimary">
                  PLAY & WIN
                </Text>
                <Text variant="h3" color="textOnPrimary">
                  {predictor.title}
                </Text>
              </View>
              <Icon name="chevronRight" size={22} color={theme.colors.white} />
            </View>
          </Card>
        ) : null}

        {/* All products */}
        <View>
          <SectionHeader title="All products" />
          <ProductGrid products={products} loading={loading} emptyMessage="No products yet. Pull to refresh." />
        </View>

        {/* Company entry — the informative website lives one tap away */}
        <Card onPress={() => router.push('/company')} radius="3xl" style={{ backgroundColor: theme.colors.inverse }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Text variant="overline" color="primaryLight">
                {(content.brand?.name || 'AS COMPANY').toUpperCase()}
              </Text>
              <Text variant="callout" color="textOnInverseMuted" style={{ marginTop: 4 }}>
                {content.brand?.tagline || 'Market leader in telecommunication and electronics in Lebanon since 2008.'}
              </Text>
            </View>
            <Icon name="chevronRight" size={20} color={theme.colors.textOnInverseMuted} />
          </View>
        </Card>
      </View>
    </Screen>
  )
}
