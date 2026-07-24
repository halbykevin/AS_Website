// The sort/filter toolbar shown above a product listing — the RN port of the AS
// Store web <ProductFilters> mobile bar: a live product count on the left, and
// "Sort" + "Filter" pill buttons on the right that open bottom sheets. The
// Filter button carries a red badge with the active-filter count.
//
// State is owned by the screen and passed down; this component is pure chrome +
// sheet plumbing (opens SortSheet / FilterSheet through the global useSheet API).

import { View, Pressable } from 'react-native';
import { useTheme, useThemedStyles } from '@/src/theme';
import { useSheet } from '@/src/ui';
import Text from '@/src/ui/Text';
import Icon from '@/src/ui/Icon';
import SortSheet from './SortSheet';
import FilterSheet from './FilterSheet';
import { activeFilterCount } from '@/src/lib/catalogFilters';

export default function CatalogToolbar({ total = 0, sort, filters, facets, bounds, products, showCategory = true, onSortChange, onFiltersChange }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const sheet = useSheet();
  const activeCount = activeFilterCount(filters);

  const openSort = () =>
    sheet.open({
      render: ({ close }) => <SortSheet value={sort} onChange={onSortChange} onClose={close} />
    });

  const openFilter = () =>
    sheet.open({
      // A tallish sheet — the filter panel has several sections.
      snapPoints: ['85%'],
      render: ({ close }) => <FilterSheet facets={facets} bounds={bounds} products={products} initial={filters} showCategory={showCategory} onApply={onFiltersChange} onClose={close} />
    });

  return (
    <View style={styles.bar}>
      <Text variant="callout" muted>
        {total} {total === 1 ? 'product' : 'products'}
      </Text>

      <View style={styles.actions}>
        <Pressable onPress={openSort} style={({ pressed }) => [styles.pill, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Sort">
          <Icon name="menu" size={16} color={theme.colors.textMuted} />
          <Text variant="callout" weight="medium">
            Sort
          </Text>
        </Pressable>

        <Pressable onPress={openFilter} style={({ pressed }) => [styles.pill, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Filter">
          <Icon name="settings" size={16} color={theme.colors.textMuted} />
          <Text variant="callout" weight="medium">
            Filter
          </Text>
          {activeCount > 0 ? (
            <View style={styles.badge}>
              <Text variant="overline" color="textOnPrimary" style={{ fontSize: 10 }}>
                {activeCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = t => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: t.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: t.spacing.lg,
    borderRadius: t.radii.pill,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    backgroundColor: t.colors.surface
  },
  pressed: { opacity: 0.7 },
  badge: {
    marginLeft: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
