// "Per row" segmented control — Auto · 2 · 3 · 4, each drawn with little bars
// (the RN port of the web store's <DensityToggle>). Selected pill = dark ink.

import { View, Pressable } from 'react-native';
import { useTheme, useThemedStyles } from '@/src/theme';
import Text from '@/src/ui/Text';
import { COLS } from '@/src/lib/catalogFilters';

function GridGlyph({ n, color }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {Array.from({ length: n }).map((_, i) => (
        <View key={i} style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

export default function DensityToggle({ value = '', onChange }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const Item = ({ active, onPress, children, label }) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} style={[styles.item, active && styles.itemActive]}>
      {children}
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <Item active={value === ''} onPress={() => onChange?.('')} label="Auto columns">
        <Text variant="caption" weight="bold" color={value === '' ? 'textOnInverse' : 'textMuted'}>
          Auto
        </Text>
      </Item>
      {COLS.map(n => {
        const active = value === n;
        return (
          <Item key={n} active={active} onPress={() => onChange?.(n)} label={`${n} per row`}>
            <GridGlyph n={Number(n)} color={active ? theme.colors.textOnInverse : theme.colors.textMuted} />
          </Item>
        );
      })}
    </View>
  );
}

const makeStyles = t => ({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    gap: 2,
    borderRadius: t.radii.pill,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface
  },
  item: { minWidth: 40, height: 34, paddingHorizontal: 10, borderRadius: t.radii.pill, alignItems: 'center', justifyContent: 'center' },
  itemActive: { backgroundColor: t.colors.inverse }
});
