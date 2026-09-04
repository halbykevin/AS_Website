// The product browser: a grid of tiles with the sort/filter toolbar above it.
//
// One component behind two routes — the Shop tab (the whole catalog) and
// /category/<slug> (one department). They were the same screen written twice
// the moment Shop stopped being a menu and started being the products, and the
// list is the part with the fiddly bits (getItemLayout arithmetic, per-density
// cell styles, the index the filters read) that must not be allowed to drift
// between two copies.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, useWindowDimensions, View } from 'react-native';
import { useContent } from '@/src/content/ContentProvider';
import { useProducts, useCategories } from '@/src/lib/queries';
import { useTheme } from '@/src/theme';
import { Screen, Text, Skeleton, EmptyState, useScrolled } from '@/src/ui';
import ProductTile, { productTileHeight } from '@/src/components/ProductTile';
import AppHeader from '@/src/components/AppHeader';
import CatalogToolbar from './CatalogToolbar';
import { buildCatalogIndex, queryCatalog, categoryFacets, brandFacets, priceBounds, resolveColumns } from '@/src/lib/catalogFilters';
import { logCatalogLoad, logFacets, logFilterResult } from '@/src/lib/filterDebug';

const EMPTY_FILTERS = { cat: '', brand: '', min: null, max: null, sale: false, cols: '' };

export default function CatalogScreen({
  // '' or 'all' = the whole catalog; anything else is one category's slug.
  slug = 'all',
  // What the nav bar says. The list's own heading is separate and optional: on
  // the Shop tab the bar already says Shop, and repeating it in the list would
  // push the first row of products off the screen for no information.
  headerTitle,
  listTitle,
  showBack = false
}) {
  const theme = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const { storeSettings } = useContent();
  const isAll = !slug || slug === 'all';

  const cats = useCategories();
  const categories = cats.data || [];
  const { data: products = [], isLoading, isFetching, refetch } = useProducts(isAll ? {} : { category: slug });

  const [sort, setSort] = useState('featured');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const { scrolled, onScroll } = useScrolled();

  // Expo Router may reuse this dynamic-route instance when moving directly
  // between categories. Never carry a category/brand/price selection into a
  // different catalog scope.
  useEffect(() => {
    setSort('featured');
    setFilters({ ...EMPTY_FILTERS });
  }, [slug]);

  const category = categories.find(c => c.slug === slug);
  const title = headerTitle ?? (isAll ? 'All products' : category?.name || 'Products');
  const heading = listTitle === null ? null : (listTitle ?? (isAll ? 'All products' : category?.name || 'Products'));

  // Facets + bounds are derived from the loaded list, exactly like the website.
  const facets = useMemo(() => ({ categories: categoryFacets(products), brands: brandFacets(products) }), [products]);
  const bounds = useMemo(() => priceBounds(products), [products]);
  // On a single category page the category facet is redundant, so hide it there.
  // On the whole catalog it is how you get to a department now that the Shop tab
  // is the products themselves rather than a wall of category tiles.
  const showCategory = isAll && facets.categories.length > 1;

  // Derived once per loaded catalog; every subsequent filter/sort reads it.
  const index = useMemo(() => buildCatalogIndex(products), [products]);
  const visible = useMemo(() => queryCatalog(index, filters, sort), [index, filters, sort]);

  const columns = resolveColumns(filters.cols, width);

  // --- filter diagnostics (src/lib/filterDebug.js — set FILTER_DEBUG=false to mute)
  const scope = `catalog/${slug || 'all'}`;
  useEffect(() => {
    logCatalogLoad(scope, products);
  }, [products, scope]);

  useEffect(() => {
    logFacets(scope, facets, bounds, showCategory);
  }, [facets, bounds, showCategory, scope]);

  useEffect(() => {
    logFilterResult(scope, products, filters, visible.length);
  }, [products, filters, visible.length, scope]);

  // One style object for every cell, rebuilt only when the density changes —
  // an inline literal here allocates a fresh object per tile per render, which
  // also defeats RN's style diffing on a list this long.
  //
  // The row gap lives here as a margin rather than as `gap` on the content
  // container: VirtualizedList puts spacer views around the rendered window, and
  // a container `gap` spaces those too, which would drift the real offsets away
  // from what getItemLayout promises.
  const rowGap = theme.spacing.md;
  const cellStyle = useMemo(() => ({ flex: 1 / columns, maxWidth: `${100 / columns}%`, marginBottom: rowGap }), [columns, rowGap]);

  // Every tile is the same height by construction (see productTileHeight), so
  // the grid can tell FlatList each row's size up front instead of measuring
  // ~1370 cells while you scroll.
  //
  // NOTE: with numColumns > 1, FlatList reports Math.ceil(items / numColumns) to
  // VirtualizedList and passes getItemLayout straight through — so `i` here is
  // the ROW index, not the item index. Treating it as an item index silently
  // corrupts every scroll offset.
  const rowHeight = useMemo(() => productTileHeight(fontScale) + rowGap, [fontScale, rowGap]);
  const getItemLayout = useCallback((_, i) => ({ length: rowHeight, offset: rowHeight * i, index: i }), [rowHeight]);

  const renderItem = useCallback(
    ({ item }) => (
      <View style={cellStyle}>
        <ProductTile product={item} fluid />
      </View>
    ),
    [cellStyle]
  );
  const keyExtractor = useCallback(item => String(item.id), []);

  const onRefresh = useCallback(() => {
    refetch();
    cats.refetch();
  }, [refetch, cats]);

  const header = (
    <View style={{ paddingBottom: theme.spacing.md }}>
      {heading ? <Text variant="h1">{heading}</Text> : null}
      {category?.tagline ? (
        <Text variant="body" muted style={{ marginTop: 4 }}>
          {category.tagline}
        </Text>
      ) : null}
      <CatalogToolbar total={visible.length} loading={isLoading} sort={sort} filters={filters} facets={facets} bounds={bounds} index={index} showCategory={showCategory} onSortChange={setSort} onFiltersChange={setFilters} />
    </View>
  );

  const empty = isLoading ? (
    <View style={{ gap: theme.spacing.md }}>
      {[0, 1].map(r => (
        <View key={r} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <Skeleton height={300} radius="3xl" style={{ flex: 1 }} />
          <Skeleton height={300} radius="3xl" style={{ flex: 1 }} />
        </View>
      ))}
    </View>
  ) : (
    <EmptyState icon="bag" message="No products match these filters." />
  );

  return (
    <Screen edges={['left', 'right']} scroll={false} padded={false} contentStyle={{ flex: 1 }} statusBarStyle="light" header={<AppHeader brand="store" title={title} showBack={showBack} search assistant bag scrolled={scrolled} announcement={storeSettings?.announcement} />}>
      <FlatList
        key={`cols-${columns}`}
        data={visible}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={columns > 1 ? columns : undefined}
        columnWrapperStyle={columns > 1 ? { gap: theme.spacing.md } : undefined}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={getItemLayout}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        contentContainerStyle={{
          paddingHorizontal: theme.layout.screenPadding,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing['4xl']
        }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
