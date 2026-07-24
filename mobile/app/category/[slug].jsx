import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSelector } from 'react-redux';
import { useContent } from '@/src/content/ContentProvider';
import { useProducts, useCategories } from '@/src/lib/queries';
import { selectCartCount } from '@/src/store/cartSlice';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Chip, Icon, Skeleton, EmptyState } from '@/src/ui';
import ProductTile from '@/src/components/ProductTile';
import AnnouncementBar from '@/src/components/AnnouncementBar';

const SORTS = [
  { id: 'featured', label: 'Featured' },
  { id: 'price-asc', label: 'Price ↑' },
  { id: 'price-desc', label: 'Price ↓' },
  { id: 'name', label: 'A–Z' }
];

export default function CategoryScreen() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams();
  const { storeSettings } = useContent();
  const isAll = slug === 'all';

  const { data: categories = [] } = useCategories();
  const { data: products = [], isLoading } = useProducts(isAll ? {} : { category: slug });
  const [sort, setSort] = useState('featured');

  const category = categories.find(c => c.slug === slug);
  const title = isAll ? 'All products' : category?.name || 'Products';

  const sorted = useMemo(() => {
    const list = [...products];
    switch (sort) {
      case 'price-asc':
        return list.sort((a, b) => (a.price || 0) - (b.price || 0));
      case 'price-desc':
        return list.sort((a, b) => (b.price || 0) - (a.price || 0));
      case 'name':
        return list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      default:
        return list;
    }
  }, [products, sort]);

  // Stable callbacks so memoized tiles never re-render on list re-renders.
  const renderItem = useCallback(
    ({ item }) => (
      <View style={{ flex: 1, maxWidth: '50%' }}>
        <ProductTile product={item} fluid />
      </View>
    ),
    []
  );
  const keyExtractor = useCallback(item => String(item.id), []);

  const header = (
    <View style={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="h1">{title}</Text>
        <Text variant="caption" faint>
          {sorted.length} item{sorted.length === 1 ? '' : 's'}
        </Text>
      </View>
      {category?.tagline ? (
        <Text variant="body" muted>
          {category.tagline}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -theme.layout.screenPadding }} contentContainerStyle={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.sm }}>
        {SORTS.map(s => (
          <Chip key={s.id} label={s.label} selected={sort === s.id} onPress={() => setSort(s.id)} />
        ))}
      </ScrollView>
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
    <EmptyState icon="bag" message="No products in this category yet." />
  );

  return (
    <Screen edges={['top']} scroll={false} padded={false} contentStyle={{ flex: 1 }}>
      <AnnouncementBar announcement={storeSettings?.announcement} />
      <Header title={title} right={<HeaderActions />} />

      <FlatList
        data={sorted}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={2}
        columnWrapperStyle={{ gap: theme.spacing.md }}
        contentContainerStyle={{
          paddingHorizontal: theme.layout.screenPadding,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing['4xl'],
          gap: theme.spacing.md
        }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        // Virtualization tuning: render a screenful first, keep the window tight.
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

// Search + bag shortcuts on the header's right side.
function HeaderActions() {
  const theme = useTheme();
  const count = useSelector(selectCartCount);
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.lg, alignItems: 'center' }}>
      <Pressable onPress={() => router.push('/search')} hitSlop={theme.layout.hitSlop}>
        <Icon name="search" size={22} />
      </Pressable>
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
    </View>
  );
}
