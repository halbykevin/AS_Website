// Image tile for a store/event category. Tapping it filters the relevant list.
import { Pressable, View } from 'react-native';
import { useTheme, useThemedStyles } from '@/src/theme';
import Text from '@/src/ui/Text';
import RemoteImage from './RemoteImage';

export default function CategoryTile({ category, onPress, height = 120 }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, { height }, pressed && { opacity: 0.9 }]}>
      <RemoteImage uri={category.image} style={styles.img} fallbackIcon="grid" />
      <View style={styles.scrim} />
      <View style={styles.label}>
        <Text variant="title" color="textOnInverse" numberOfLines={2}>
          {category.name}
        </Text>
      </View>
    </Pressable>
  );
}

const makeStyles = t => ({
  tile: { borderRadius: t.radii['2xl'], overflow: 'hidden', backgroundColor: t.colors.inverse },
  img: { ...StyleSheetAbsoluteFill() },
  scrim: { ...StyleSheetAbsoluteFill(), backgroundColor: 'rgba(0,0,0,0.35)' },
  label: { position: 'absolute', left: t.spacing.lg, right: t.spacing.lg, bottom: t.spacing.lg }
});

// Small helper to avoid importing StyleSheet just for absoluteFillObject.
function StyleSheetAbsoluteFill() {
  return { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
}
