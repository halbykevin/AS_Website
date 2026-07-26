// Content of the "Filter" bottom sheet — the RN port of the AS Store web filter
// panel: Category, Brand, Price range, On-sale toggle and a Per-row density
// control, with a live "Show N" count in the footer and a "Clear all" reset.
//
// It keeps a local DRAFT of the selection and only pushes it to the screen when
// the shopper taps "Show N" (so a half-made choice never reshuffles the grid
// underneath the sheet). Category/Brand open a nested option-picker sheet —
// which is exactly what the global Sheet stack is for.

import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/src/theme';
import { SheetScaffold, SheetPressable, useSheet, Switch, RangeSlider } from '@/src/ui';
import Text from '@/src/ui/Text';
import Icon from '@/src/ui/Icon';
import Button from '@/src/ui/Button';
import DensityToggle from './DensityToggle';
import { applyFilters } from '@/src/lib/catalogFilters';
import { logSheet, logPick, logDraft, logApply } from '@/src/lib/filterDebug';

const EMPTY = { cat: '', brand: '', min: null, max: null, sale: false, cols: '' };

export default function FilterSheet({ facets, bounds, products = [], initial, showCategory = true, onApply, onClose }) {
  const theme = useTheme();
  const sheet = useSheet();
  const [draft, setDraft] = useState({ ...EMPTY, ...initial });

  const patch = p => setDraft(d => ({ ...d, ...p }));
  const hasPrice = bounds.max > bounds.min;

  const count = useMemo(() => applyFilters(products, draft).length, [products, draft]);

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

  // Keep the catalog behind the sheet live. This also removes the old failure
  // mode where a valid selection looked like it did nothing until "Show" was
  // pressed (or was lost when Android dismissed a nested picker).
  useEffect(() => {
    logApply(draft);
    onApply?.(draft);
  }, [draft, onApply]);

  const money = n => `$${Number(n || 0).toLocaleString()}`;
  const catLabel = facets.categories.find(c => c.value === draft.cat)?.label || 'All categories';
  const brandLabel = facets.brands.find(b => b.value === draft.brand)?.label || 'All brands';
  const priceLabel = draft.min != null || draft.max != null ? `${money(draft.min ?? bounds.min)} – ${money(draft.max ?? bounds.max)}` : 'Any price';

  // Open a nested picker sheet and resolve the chosen value back into the draft.
  const openPicker = (title, options, current, onPick) => {
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
          options={[{ value: '', label: title.includes('categor') ? 'All categories' : 'All brands' }, ...options.map(o => ({ value: o.value, label: `${o.label} (${o.count})` }))]}
          value={current}
          onPick={v => {
            const label = options.find(o => o.value === v)?.label || 'All';
            logPick(title.toLowerCase().includes('categor') ? 'cat' : 'brand', v, label);
            onPick(v);
            close();
          }}
          onClose={close}
        />
      )
    });
  };

  const footer = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <Button label="Clear all" variant="ghost" onPress={() => setDraft({ ...EMPTY })} style={{ flex: 1 }} />
      <Button
        label={`Show ${count}`}
        variant="primary"
        onPress={() => {
          onClose?.();
        }}
        style={{ flex: 1.4 }}
      />
    </View>
  );

  return (
    <SheetScaffold title="Filter" onClose={onClose} footer={footer} scroll contentStyle={{ gap: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
      {showCategory && facets.categories.length > 0 ? (
        <Field label="Category">
          <SelectRow label={catLabel} active={Boolean(draft.cat)} onPress={() => openPicker('Category', facets.categories, draft.cat, v => patch({ cat: v }))} />
        </Field>
      ) : null}

      {facets.brands.length > 0 ? (
        <Field label="Brand">
          <SelectRow label={brandLabel} active={Boolean(draft.brand)} onPress={() => openPicker('Brand', facets.brands, draft.brand, v => patch({ brand: v }))} />
        </Field>
      ) : null}

      {hasPrice ? (
        <Field label="Price" value={priceLabel}>
          <RangeSlider bounds={bounds} low={draft.min ?? bounds.min} high={draft.max ?? bounds.max} onCommit={(lo, hi) => patch({ min: lo > bounds.min ? lo : null, max: hi < bounds.max ? hi : null })} />
        </Field>
      ) : null}

      <Row>
        <Text variant="title">On sale only</Text>
        <Switch value={draft.sale} onValueChange={v => patch({ sale: v })} />
      </Row>

      <Row>
        <Text variant="title">Per row</Text>
        <DensityToggle value={draft.cols} onChange={v => patch({ cols: v })} />
      </Row>
    </SheetScaffold>
  );
}

function Field({ label, value, children }) {
  const theme = useTheme();
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: theme.spacing.sm }}>
        <Text variant="overline" faint>
          {label.toUpperCase()}
        </Text>
        {value ? (
          <Text variant="caption" muted>
            {value}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Row({ children }) {
  const theme = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>{children}</View>;
}

function SelectRow({ label, active, onPress }) {
  const theme = useTheme();
  return (
    <SheetPressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 48,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: active ? theme.colors.borderStrong : theme.colors.border,
        backgroundColor: theme.colors.surface
      }}
    >
      <Text variant="body" weight={active ? 'semibold' : 'regular'} numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Text>
      <Icon name="chevronDown" size={18} color={theme.colors.textFaint} />
    </SheetPressable>
  );
}

// Nested option list (Category / Brand). Pushed on top of the Filter sheet.
function OptionPicker({ title, options, value, onPick, onClose }) {
  const theme = useTheme();
  return (
    <SheetScaffold title={title} onClose={onClose} scroll>
      <View style={{ paddingBottom: theme.spacing.sm }}>
        {options.map((o, i) => {
          const selected = (value || '') === o.value;
          return (
            <SheetPressable
              key={o.value || 'all'}
              onPress={() => onPick(o.value)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: theme.spacing.md + 2,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: theme.colors.border
              }}
            >
              <Text variant="bodyLg" weight={selected ? 'semibold' : 'regular'} color={selected ? 'primary' : 'text'}>
                {o.label}
              </Text>
              {selected ? <Icon name="check" size={20} color={theme.colors.primary} /> : null}
            </SheetPressable>
          );
        })}
      </View>
    </SheetScaffold>
  );
}
