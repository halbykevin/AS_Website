// Small pill labels: sale flags, statuses, counts. `tone` picks the palette.
import { View } from 'react-native';
import { useTheme, useThemedStyles } from '@/src/theme';
import Text from './Text';

const TONES = {
  primary: { bg: 'primary', fg: 'textOnPrimary' },
  ink: { bg: 'inverse', fg: 'textOnInverse' },
  amber: { bg: 'accent', fg: 'inverse' },
  neutral: { bg: 'surfaceSunken', fg: 'text' },
  success: { bg: 'success', fg: 'textOnPrimary' },
  danger: { bg: 'danger', fg: 'textOnPrimary' }
};

export default function Badge({ label, tone = 'primary', style }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = TONES[tone] || TONES.primary;
  return (
    <View style={[styles.badge, { backgroundColor: theme.colors[t.bg] }, style]}>
      <Text variant="overline" color={t.fg}>
        {label}
      </Text>
    </View>
  );
}

const makeStyles = t => ({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: t.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4
  }
});
