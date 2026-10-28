import { Pressable } from 'react-native';
import { useThemedStyles } from '@/src/theme';
import Text from './Text';

// `count`, when given, trails the label in a lighter weight ("Tick'it 62").
export default function Chip({ label, count, selected = false, onPress, style }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && { opacity: 0.85 }, style]}>
      <Text variant="callout" color={selected ? 'textOnPrimary' : 'text'} weight={selected ? 'semibold' : 'medium'}>
        {label}
        {count != null ? (
          <Text variant="callout" color={selected ? 'textOnInverseMuted' : 'textFaint'} weight="medium">
            {`  ${count}`}
          </Text>
        ) : null}
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
