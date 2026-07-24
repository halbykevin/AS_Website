// Selectable filter chip (category filters, sort options). Selected = AS red.
import { Pressable } from 'react-native';
import { useTheme, useThemedStyles } from '@/src/theme';
import Text from './Text';

export default function Chip({ label, selected = false, onPress, style }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && { opacity: 0.85 }, style]}>
      <Text variant="callout" color={selected ? 'textOnPrimary' : 'text'} weight={selected ? 'semibold' : 'medium'}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = t => ({
  chip: {
    borderRadius: t.radii.pill,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: 8,
    backgroundColor: t.colors.surface
  },
  selected: { backgroundColor: t.colors.primary, borderColor: t.colors.primary }
});
