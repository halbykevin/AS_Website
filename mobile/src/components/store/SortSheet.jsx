// Content of the "Sort by" bottom sheet — a tappable option list with a check on
// the active one (mirrors the AS Store web sort sheet). Rendered inside a Sheet
// via useSheet().open({ render: ({ close }) => <SortSheet … /> }).

import { View, Pressable } from 'react-native';
import { useTheme } from '@/src/theme';
import { SheetScaffold } from '@/src/ui';
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
            <Pressable
              key={s.value}
              onPress={() => {
                onChange?.(s.value);
                onClose?.();
              }}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: theme.spacing.md + 2,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border
                },
                pressed && { opacity: 0.6 }
              ]}
            >
              <Text variant="bodyLg" weight={selected ? 'semibold' : 'regular'} color={selected ? 'primary' : 'text'}>
                {s.label}
              </Text>
              {selected ? <Icon name="check" size={20} color={theme.colors.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
    </SheetScaffold>
  );
}
