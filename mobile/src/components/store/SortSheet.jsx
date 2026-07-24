// Content of the "Sort by" bottom sheet — a tappable option list with a check on
// the active one (mirrors the AS Store web sort sheet). Rendered inside a Sheet
// via useSheet().open({ render: ({ close }) => <SortSheet … /> }).

import { View } from 'react-native';
import { useTheme } from '@/src/theme';
import { SheetScaffold, SheetPressable } from '@/src/ui';
import Text from '@/src/ui/Text';
import Icon from '@/src/ui/Icon';
import { SORTS } from '@/src/lib/catalogFilters';

export default function SortSheet({ value, onChange, onClose }) {
  const theme = useTheme();
  return (
    <SheetScaffold title="Sort by" onClose={onClose}>
      <View style={{ paddingBottom: theme.spacing.sm }}>
        {SORTS.map((s, i) => {
          const selected = (value || 'featured') === s.value;
          return (
            <SheetPressable
              key={s.value}
              onPress={() => {
                onChange?.(s.value);
                onClose?.();
              }}
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
                {s.label}
              </Text>
              {selected ? <Icon name="check" size={20} color={theme.colors.primary} /> : null}
            </SheetPressable>
          );
        })}
      </View>
    </SheetScaffold>
  );
}
