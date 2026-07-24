// Home tab — the AS Store storefront, front and center.
//
// Performance-first: ONE capped feed query (limit 48) drives the hero rails,
// deals and a small grid preview — the full catalog never mounts here. The
// complete list lives in /category/all, which is a virtualized FlatList.

import { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useContent } from '@/src/content/ContentProvider';
import { useProducts, useCategories } from '@/src/lib/queries';
import { useTheme } from '@/src/theme';
import { Screen, Text, Card, Chip, Icon, SectionHeader, Button } from '@/src/ui';
import BrandBar from '@/src/components/BrandBar';
import AnnouncementBar from '@/src/components/AnnouncementBar';
import ComingSoon from '@/src/components/ComingSoon';
import SearchPill from '@/src/components/SearchPill';
import ProductTile from '@/src/components/ProductTile';
import ProductGrid from '@/src/components/ProductGrid';
import HRail from '@/src/components/HRail';

const FEED_LIMIT = 48; // one bounded request feeds every section below
const PREVIEW_COUNT = 8; // grid preview size — the rest lives in /category/all

export default function HomeScreen() {
  const theme = useTheme();
  const { content, storeSettings, refresh: refreshContent } = useContent();

  const feed = useProducts({ limit: FEED_LIMIT });
  const featured = useProducts({ featured: 1, limit: 10 });
  const cats = useCategories();

  const products = feed.data || [];
  const predictor = content.predictor;

  const onRefresh = useCallback(() => {
    refreshContent();
    feed.refetch();
    featured.refetch();
    cats.refetch();
  }, [refreshContent, feed.refetch, featured.refetch, cats.refetch]);

  // All derived from the single feed — no extra network requests.
  const topCats = useMemo(() => (cats.data || []).filter(c => !c.parentId), [cats.data]);
  const newIn = useMemo(() => products.slice(0, 8), [products]);
  const deals = useMemo(() => products.filter(p => p.salePercent || (p.oldPrice && Number(p.oldPrice) > Number(p.price))).slice(0, 10), [products]);
  const preview = useMemo(() => products.slice(0, PREVIEW_COUNT), [products]);

  if (storeSettings && storeSettings.published === false) {
    return (
      <Screen edges={['top']} scroll={false} padded={false}>
        <ComingSoon settings={storeSettings} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }} refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={onRefresh} tintColor={theme.colors.primary} />}>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -theme.layout.screenPadding }} contentContainerStyle={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.sm }}>
            <Chip label="All" selected onPress={() => router.push('/category/all')} />
            {topCats.map(c => (
              <Chip key={c.id} label={c.name} onPress={() => router.push(`/category/${c.slug}`)} />
            ))}
          </ScrollView>
        ) : null}

        {/* Hot deals — dark spotlight, only when a promotion is running */}
        {deals.length > 0 ? (
          <View
            style={{
              backgroundColor: theme.colors.inverse,
              borderRadius: theme.radii['3xl'],
              padding: theme.spacing.lg,
              marginHorizontal: -theme.spacing.xs
            }}
          >
            <SectionHeader eyebrow="Limited time" title="Hot deals" onInverse style={{ marginBottom: theme.spacing.md }} />
            <HRail data={deals} itemWidth={220} edgePadding={theme.spacing.lg} renderItem={p => <ProductTile product={p} width={220} />} />
          </View>
        ) : null}

        {/* New in rail */}
        {newIn.length > 0 ? (
          <View>
            <SectionHeader eyebrow={storeSettings?.homeNew?.eyebrow} title={storeSettings?.homeNew?.heading || 'New in'} actionLabel="Shop all" onAction={() => router.push('/category/all')} />
            <HRail data={newIn} itemWidth={220} renderItem={p => <ProductTile product={p} width={220} />} />
          </View>
        ) : null}

        {/* Featured rail */}
        {(featured.data || []).length > 0 ? (
          <View>
            <SectionHeader eyebrow="Featured" title="Editor's picks" />
            <HRail data={featured.data} itemWidth={220} renderItem={p => <ProductTile product={p} width={220} />} />
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

        {/* Product preview grid + the door to the full (virtualized) catalog */}
        <View>
          <SectionHeader title="Popular right now" actionLabel="View all" onAction={() => router.push('/category/all')} />
          <ProductGrid products={preview} loading={feed.isLoading} emptyMessage="No products yet. Pull to refresh." />
          {products.length > PREVIEW_COUNT ? <Button label="View all products" variant="ghost" iconRight="arrowRight" onPress={() => router.push('/category/all')} fullWidth style={{ marginTop: theme.spacing.lg }} /> : null}
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
  );
}
