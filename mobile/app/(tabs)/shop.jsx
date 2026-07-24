import { useMemo } from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useContent } from '@/src/content/ContentProvider';
import { useCategories } from '@/src/lib/queries';
import { useTheme } from '@/src/theme';
import { Screen, Text, Card, Chip, Icon, SectionHeader, Skeleton } from '@/src/ui';
import BrandBar from '@/src/components/BrandBar';
import AnnouncementBar from '@/src/components/AnnouncementBar';
import ComingSoon from '@/src/components/ComingSoon';
import SearchPill from '@/src/components/SearchPill';
import CategoryTile from '@/src/components/CategoryTile';

const chunkPairs = arr => {
  const out = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
};

export default function ShopScreen() {
  const theme = useTheme();
  const { storeSettings, refresh: refreshContent } = useContent();
  const cats = useCategories();

  const categories = cats.data || [];
  const topCats = useMemo(() => categories.filter(c => !c.parentId), [categories]);
  const childrenOf = useMemo(() => {
    const map = new Map();
    for (const c of categories) {
      if (!c.parentId) continue;
      if (!map.has(c.parentId)) map.set(c.parentId, []);
      map.get(c.parentId).push(c);
    }
    return map;
  }, [categories]);

  const onRefresh = () => {
    refreshContent();
    cats.refetch();
  };

  if (storeSettings && storeSettings.published === false) {
    return (
      <Screen edges={['top']} scroll={false} padded={false}>
        <ComingSoon settings={storeSettings} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }} refreshControl={<RefreshControl refreshing={cats.isLoading} onRefresh={onRefresh} tintColor={theme.colors.primary} />}>
      <AnnouncementBar announcement={storeSettings?.announcement} />
      <BrandBar variant="store" title="Shop" />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing['2xl'], paddingTop: theme.spacing.xs }}>
        <SearchPill />

        {/* All products shortcut */}
        <Card onPress={() => router.push('/category/all')} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radii.lg,
              backgroundColor: theme.alpha(theme.colors.primary, 0.1),
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Icon name="bag" size={22} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title">All products</Text>
            <Text variant="caption" muted>
              Browse the full catalog
            </Text>
          </View>
          <Icon name="chevronRight" size={20} color={theme.colors.textFaint} />
        </Card>

        {/* Categories */}
        <View>
          <SectionHeader title="Shop by category" />
          {cats.isLoading ? (
            <View style={{ gap: theme.spacing.md }}>
              {[0, 1].map(r => (
                <View key={r} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                  <Skeleton height={120} radius="2xl" style={{ flex: 1 }} />
                  <Skeleton height={120} radius="2xl" style={{ flex: 1 }} />
                </View>
              ))}
            </View>
          ) : (
            <View style={{ gap: theme.spacing.lg }}>
              {chunkPairs(topCats).map((pair, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                  {pair.map(c => (
                    <View key={c.id} style={{ flex: 1, gap: theme.spacing.sm }}>
                      <CategoryTile category={c} onPress={() => router.push(`/category/${c.slug}`)} />
                      {/* Subcategory chips under their department */}
                      {(childrenOf.get(c.id) || []).length > 0 ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {childrenOf.get(c.id).map(ch => (
                            <Chip key={ch.id} label={ch.name} onPress={() => router.push(`/category/${ch.slug}`)} />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))}
                  {pair.length < 2 ? <View style={{ flex: 1 }} /> : null}
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
