// Content of the "Filter" bottom sheet — the RN port of the AS Store web filter
// panel: Category, Brand, Price range, On-sale toggle and a Per-row density
// control, with a live "Show N" count in the footer and a "Clear all" reset.
//
// Laid out as iOS-style grouped rows: three cards on a tinted well, each row
// stating its own name on the left and its current value on the right (in brand
// red once it's set), so the whole active selection is readable at a glance
// without a separate label above every control.
//
// Selections apply live: every change goes to the screen immediately and the
// footer's "Show N" just closes the sheet. Category/Brand open a nested
// option-picker sheet on top of this one, which is what the global Sheet stack
// is for — see `patch` for why the pick is written through to the screen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTheme, useThemedStyles } from '@/src/theme';
import { SheetScaffold, SheetPressable, useSheet, Switch, RangeSlider } from '@/src/ui';
import Text from '@/src/ui/Text';
import Icon from '@/src/ui/Icon';
import Button from '@/src/ui/Button';
import DensityToggle from './DensityToggle';
import { applyFilters, activeFilterCount } from '@/src/lib/catalogFilters';
import { logSheet, logPick, logDraft, logApply } from '@/src/lib/filterDebug';

const EMPTY = { cat: '', brand: '', min: null, max: null, sale: false, cols: '' };

export default function FilterSheet({ facets, bounds, products = [], initial, showCategory = true, onApply, onClose }) {
  const styles = useThemedStyles(makeStyles);
  const sheet = useSheet();
  const [draft, setDraft] = useState(() => ({ ...EMPTY, ...initial }));
  const draftRef = useRef(draft);
  // RangeSlider seeds its thumb positions into shared values on mount and then
  // owns them, so it can't be driven back to the bounds by a prop. Bumping this
  // key remounts it, which is how "Clear all" also clears the price range.
  const [priceEpoch, setPriceEpoch] = useState(0);

  // Single writer for the draft, and it pushes straight to the screen instead of
  // waiting for an effect. Category/Brand are picked in a NESTED sheet, so this
  // component can be torn down while the picker is still on top; a bare setDraft
  // would then land on an unmounted component and the pick would vanish. onApply
  // belongs to the screen, which is always mounted, so the choice always lands.
  const patch = useCallback(
    p => {
      const next = { ...draftRef.current, ...p };
      draftRef.current = next;
      setDraft(next);
      logApply(next);
      onApply?.(next);
    },
    [onApply]
  );

  const clearAll = useCallback(() => {
    setPriceEpoch(e => e + 1);
    patch(EMPTY);
  }, [patch]);

  const hasPrice = bounds.max > bounds.min;
  const hasCategory = showCategory && facets.categories.length > 0;
  const hasBrand = facets.brands.length > 0;

  const count = useMemo(() => applyFilters(products, draft).length, [products, draft]);
  const activeCount = activeFilterCount(draft);

  // Mount/unmount tracing: if this sheet unmounts while the nested Category or
  // Brand picker is open, the pick lands on a dead component and silently does
  // nothing — which looks exactly like "the filter doesn't work".
  useEffect(() => {
    logSheet('FilterSheet mounted', { initial, products: products.length, showCategory });
    return () => logSheet('FilterSheet UNMOUNTED');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logDraft(draft, count);
  }, [draft, count]);

  const catLabel = facets.categories.find(c => c.value === draft.cat)?.label || 'All categories';
  const brandLabel = facets.brands.find(b => b.value === draft.brand)?.label || 'All brands';

  // Open a nested picker sheet and resolve the chosen value back into the draft.
  const openPicker = (title, options, current, onPick) => {
    const isCategory = title.toLowerCase().includes('categor');
    logSheet('openPicker', { title, options: options.length, current: current || '(all)' });
    if (!options.length) {
      console.warn(`[filters] "${title}" picker opened with 0 options — nothing to choose.`);
    }
    sheet.open({
      // SheetScaffold uses BottomSheetScrollView here, which must have a bounded
      // height. Without this the nested picker can measure to zero on Android.
      snapPoints: ['70%'],
      render: ({ close }) => (
        <OptionPicker
          title={title}
          options={[{ value: '', label: isCategory ? 'All categories' : 'All brands' }, ...options.map(o => ({ value: o.value, label: o.label, count: o.count }))]}
          value={current}
          onPick={v => {
            logPick(isCategory ? 'cat' : 'brand', v, options.find(o => o.value === v)?.label || 'All');
            onPick(v);
            close();
          }}
          onClose={close}
        />
      )
    });
  };

  const footer = (
    <View style={styles.footer}>
      <Button label="Clear all" variant="ghost" disabled={activeCount === 0} onPress={clearAll} style={{ flex: 1 }} />
      {/* Stays pressable at zero results — it's also the way out of the sheet. */}
      <Button label={count ? `Show ${count.toLocaleString()}` : 'No matches'} variant="primary" onPress={() => onClose?.()} style={{ flex: 1.35 }} />
    </View>
  );

  return (
    <SheetScaffold
      title="Filter"
      subtitle={activeCount ? `${activeCount} filter${activeCount > 1 ? 's' : ''} applied` : 'Narrow down the catalog'}
      onClose={onClose}
      footer={footer}
      scroll
      contentStyle={styles.body}
    >
      {hasCategory || hasBrand ? (
        <Group>
          {hasCategory ? <PickerRow label="Category" value={catLabel} active={Boolean(draft.cat)} onPress={() => openPicker('Category', facets.categories, draft.cat, v => patch({ cat: v }))} /> : null}
          {hasCategory && hasBrand ? <RowDivider /> : null}
          {hasBrand ? <PickerRow label="Brand" value={brandLabel} active={Boolean(draft.brand)} onPress={() => openPicker('Brand', facets.brands, draft.brand, v => patch({ brand: v }))} /> : null}
        </Group>
      ) : null}

      {hasPrice ? (
        <Group style={styles.priceGroup}>
          <Text variant="title">Price</Text>
          {/* The slider owns the two $ labels: they track the thumbs live, and
              re-rendering them inside RangeSlider keeps the drag from
              re-filtering the whole catalog on every frame. */}
          <RangeSlider key={priceEpoch} bounds={bounds} low={draft.min ?? bounds.min} high={draft.max ?? bounds.max} onCommit={(lo, hi) => patch({ min: lo > bounds.min ? lo : null, max: hi < bounds.max ? hi : null })} />
        </Group>
      ) : null}

      <Group>
        <View style={styles.row}>
          <Text variant="title" style={styles.rowLabel}>
            On sale only
          </Text>
          <Switch value={draft.sale} onValueChange={v => patch({ sale: v })} />
        </View>
        <RowDivider />
        <View style={styles.row}>
          <Text variant="title" style={styles.rowLabel}>
            Per row
          </Text>
          <DensityToggle value={draft.cols} onChange={v => patch({ cols: v })} />
        </View>
      </Group>
    </SheetScaffold>
  );
}

// A card of related rows, sitting on a tinted well so it reads as one unit
// against the sheet's white background.
function Group({ children, style }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.group, style]}>{children}</View>;
}

// Inset so it separates the rows without cutting the card in half.
function RowDivider() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.divider} />;
}

function PickerRow({ label, value, active, onPress }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <SheetPressable onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} accessibilityHint={`Choose a ${label.toLowerCase()}`}>
      <Text variant="title" style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="body" weight={active ? 'semibold' : 'regular'} color={active ? 'primary' : 'textMuted'} numberOfLines={1} style={styles.rowValue}>
        {value}
      </Text>
      <Icon name="chevronDown" size={18} color={active ? theme.colors.primary : theme.colors.textFaint} />
    </SheetPressable>
  );
}

// Nested option list (Category / Brand). Pushed on top of the Filter sheet.
function OptionPicker({ title, options, value, onPick, onClose }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <SheetScaffold title={title} onClose={onClose} scroll>
      <View style={{ paddingBottom: theme.spacing.sm }}>
        {options.map((o, i) => {
          const selected = (value || '') === o.value;
          return (
            <SheetPressable key={o.value || 'all'} onPress={() => onPick(o.value)} style={[styles.option, i > 0 && styles.optionBordered]} accessibilityRole="button" accessibilityState={{ selected }}>
              <Text variant="bodyLg" weight={selected ? 'semibold' : 'regular'} color={selected ? 'primary' : 'text'} numberOfLines={1} style={{ flex: 1 }}>
                {o.label}
              </Text>
              {o.count != null ? (
                <Text variant="caption" faint>
                  {o.count.toLocaleString()}
                </Text>
              ) : null}
              <View style={styles.optionCheck}>{selected ? <Icon name="check" size={20} color={theme.colors.primary} /> : null}</View>
            </SheetPressable>
          );
        })}
      </View>
    </SheetScaffold>
  );
}

const makeStyles = t => ({
  body: { gap: t.spacing.md, paddingTop: t.spacing.xs, paddingBottom: t.spacing.lg },

  group: {
    borderRadius: t.radii['2xl'],
    backgroundColor: t.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: t.colors.border,
    overflow: 'hidden'
  },
  priceGroup: { padding: t.spacing.lg, gap: t.spacing.md },

  // 56 keeps every row comfortably past the 48dp minimum tap target.
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.md, minHeight: 56, paddingHorizontal: t.spacing.lg },
  rowLabel: { flexShrink: 0 },
  rowValue: { flex: 1, textAlign: 'right' },
  divider: { height: 1, marginLeft: t.spacing.lg, backgroundColor: t.colors.border },

  option: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 52, paddingVertical: t.spacing.sm },
  optionBordered: { borderTopWidth: 1, borderTopColor: t.colors.border },
  optionCheck: { width: 20, alignItems: 'flex-end' },

  footer: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }
});
