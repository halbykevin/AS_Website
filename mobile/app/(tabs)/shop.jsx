import { useMemo } from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useContent } from '@/src/content/ContentProvider';
import { useCategories } from '@/src/lib/queries';
import { useTheme } from '@/src/theme';
import { Screen, Text, Card, Icon, Skeleton } from '@/src/ui';
import AppHeader from '@/src/components/AppHeader';
import ComingSoon from '@/src/components/ComingSoon';
import CategoryWall from '@/src/components/store/CategoryWall';

export default function ShopScreen() {
  const theme = useTheme();
  const { storeSettings, refresh: refreshContent } = useContent();
  const cats = useCategories();

  const topCats = useMemo(() => (cats.data || []).filter(c => !c.parentId), [cats.data]);

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
    <Screen edges={['left', 'right']} statusBarStyle="light" contentStyle={{ paddingHorizontal: 0 }} refreshControl={<RefreshControl refreshing={cats.isLoading} onRefresh={onRefresh} tintColor={theme.colors.primary} />} header={s => <AppHeader brand="store" title="Shop" search bag scrolled={s} announcement={storeSettings?.announcement} />}>
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing['2xl'], paddingTop: theme.spacing.lg }}>
        {/* No search field here on purpose — AppHeader already carries the
            search action, and two entry points to the same screen is noise. */}

        {/* All products shortcut */}
        <Card onPress={() => router.push('/category/all')} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
          <View style={{ width: 44, height: 44, borderRadius: theme.radii.lg, backgroundColor: theme.alpha(theme.colors.primary, 0.1), alignItems: 'center', justifyContent: 'center' }}>
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

        {/* Shop by category — full-bleed dark wall, matching the AS Store website */}
        {cats.isLoading ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            {[0, 1].map(i => (
              <Skeleton key={i} height={210} radius="2xl" style={{ flex: 1 }} />
            ))}
          </View>
        ) : (
          <CategoryWall categories={topCats} style={{ marginHorizontal: -theme.layout.screenPadding, borderRadius: 0 }} />
        )}
      </View>
    </Screen>
  );
}
