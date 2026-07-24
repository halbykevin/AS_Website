import { useCallback, useMemo, useState } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useContent } from '@/src/content/ContentProvider';
import { useProducts, useCategories } from '@/src/lib/queries';
import { useTheme } from '@/src/theme';
import { Screen, Text, Skeleton, EmptyState, useScrolled } from '@/src/ui';
import ProductTile from '@/src/components/ProductTile';
import AppHeader from '@/src/components/AppHeader';
import CatalogToolbar from '@/src/components/store/CatalogToolbar';
import { applyFilters, sortProducts, categoryFacets, brandFacets, priceBounds, resolveColumns } from '@/src/lib/catalogFilters';

const EMPTY_FILTERS = { cat: '', brand: '', min: null, max: null, sale: false, cols: '' };

export default function CategoryScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { slug } = useLocalSearchParams();
  const { storeSettings } = useContent();
  const isAll = slug === 'all';

  const { data: categories = [] } = useCategories();
  const { data: products = [], isLoading } = useProducts(isAll ? {} : { category: slug });

  const [sort, setSort] = useState('featured');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const { scrolled, onScroll } = useScrolled();

  const category = categories.find(c => c.slug === slug);
  const title = isAll ? 'All products' : category?.name || 'Products';

  // Facets + bounds are derived from the loaded list, exactly like the website.
  const facets = useMemo(() => ({ categories: categoryFacets(products), brands: brandFacets(products) }), [products]);
  const bounds = useMemo(() => priceBounds(products), [products]);
  // On a single category page the category facet is redundant, so hide it there.
  const showCategory = isAll && facets.categories.length > 1;

  const visible = useMemo(() => sortProducts(applyFilters(products, filters), sort), [products, filters, sort]);

  const columns = resolveColumns(filters.cols, width);

  const renderItem = useCallback(
    ({ item }) => (
      <View style={{ flex: 1 / columns, maxWidth: `${100 / columns}%` }}>
        <ProductTile product={item} fluid />
      </View>
    ),
    [columns]
  );
  const keyExtractor = useCallback(item => String(item.id), []);

  const header = (
    <View style={{ paddingBottom: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="h1">{title}</Text>
      </View>
      {category?.tagline ? (
        <Text variant="body" muted style={{ marginTop: 4 }}>
          {category.tagline}
        </Text>
      ) : null}
      <CatalogToolbar total={visible.length} sort={sort} filters={filters} facets={facets} bounds={bounds} products={products} showCategory={showCategory} onSortChange={setSort} onFiltersChange={setFilters} />
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
    <Screen edges={['left', 'right']} scroll={false} padded={false} contentStyle={{ flex: 1 }} statusBarStyle="light" header={<AppHeader brand="store" title={title} showBack search bag scrolled={scrolled} announcement={storeSettings?.announcement} />}>
      <FlatList
        key={`cols-${columns}`}
        data={visible}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={columns > 1 ? columns : undefined}
        columnWrapperStyle={columns > 1 ? { gap: theme.spacing.md } : undefined}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: theme.layout.screenPadding,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing['4xl'],
          gap: theme.spacing.md
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
