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

export default function CatalogToolbar({ total = 0, loading = false, sort, filters, facets, bounds, index = [], showCategory = true, onSortChange, onFiltersChange }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const sheet = useSheet();
  const activeCount = activeFilterCount(filters);

  // Every section of the filter panel is derived from the loaded catalog — the
  // category/brand facets and the price bounds all come out of it. Opened too
  // early it renders with those sections missing and a "No matches" CTA, so the
  // button stays disabled until there is something to filter. Gated on the
  // SOURCE list, not the filtered one: a filter that matches nothing must still
  // leave you a way back in to clear it.
  const ready = !loading && index.length > 0;

  const hasFacets = (showCategory && facets?.categories?.length > 0) || facets?.brands?.length > 0;
  const hasPrice = bounds?.max > bounds?.min;

  const openSort = () =>
    sheet.open({
      render: ({ close }) => <SortSheet value={sort} onChange={onSortChange} onClose={close} />
    });

  const openFilter = () => {
    if (!ready) return;
    // Size the sheet to the groups it will actually render (facets, price, and
    // the always-present sale/density controls) instead of a fixed height, so a
    // short panel doesn't open with a third of it blank. The body scrolls, so
    // shorter phones get a scrollbar rather than a clipped sheet.
    const groups = 1 + (hasFacets ? 1 : 0) + (hasPrice ? 1 : 0);
    sheet.open({
      snapPoints: [groups >= 3 ? '68%' : groups === 2 ? '56%' : '44%'],
      render: ({ close }) => <FilterSheet facets={facets} bounds={bounds} index={index} initial={filters} showCategory={showCategory} onApply={onFiltersChange} onClose={close} />
    });
  };

  return (
    <View style={styles.bar}>
      <Text variant="callout" muted>
        {/* Grouped like the sheet's "Show 1,370" CTA — the two counts sit a
            thumb apart, so they must not disagree on formatting. */}
        {loading ? 'Loading…' : `${total.toLocaleString()} ${total === 1 ? 'product' : 'products'}`}
      </Text>

      <View style={styles.actions}>
        <Pressable onPress={openSort} style={({ pressed }) => [styles.pill, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Sort">
          <Icon name="menu" size={16} color={theme.colors.textMuted} />
          <Text variant="callout" weight="medium">
            Sort
          </Text>
        </Pressable>

        <Pressable
          onPress={openFilter}
          disabled={!ready}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed, !ready && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Filter"
          accessibilityState={{ disabled: !ready }}
          accessibilityHint={ready ? 'Narrow down the catalog' : 'Available once the products have loaded'}
        >
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
  disabled: { opacity: 0.4 },
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
