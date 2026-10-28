// Where an event comes from, as a small pill — the app's twin of the hub's
// source pill: red-tinted for AS Ticketing's own events, neutral for the sites
// we list from. A name, never a link.

import { View } from 'react-native';
import { useThemedStyles } from '@/src/theme';
import { AS_TICKETING, sourceOf } from '@/src/lib/sources';
import Text from '@/src/ui/Text';

export default function SourcePill({ event, style }) {
  const styles = useThemedStyles(makeStyles);
  const source = sourceOf(event);
  if (!source) return null;
  const own = source === AS_TICKETING;
  return (
    <View style={[styles.pill, own && styles.pillOwn, style]} accessibilityLabel={`Source: ${source.name}`}>
      <View style={[styles.dot, own && styles.dotOwn]} />
      <Text variant="caption" weight="semibold" color={own ? 'primary' : 'textMuted'} numberOfLines={1}>
        {source.name}
      </Text>
    </View>
  );
}

const makeStyles = t => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    maxWidth: '100%',
    borderRadius: t.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: t.colors.surfaceSunken
  },
  pillOwn: { backgroundColor: t.colors.primaryWash },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.colors.textFaint },
  dotOwn: { backgroundColor: t.colors.primary }
});
