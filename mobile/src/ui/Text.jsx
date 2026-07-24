// Themed text. Every string in the app should render through this so type scale,
// weight, tracking and color all come from the design system.
//
//   <Text variant="h1">Events</Text>
//   <Text variant="body" muted>Reserve your spot…</Text>
//   <Text variant="overline" color="primary">Just landed</Text>

import { Text as RNText } from 'react-native';
import { useTheme } from '@/src/theme';

// Map a semantic color prop to a theme color.
function resolveColor(theme, color, muted, faint, onInverse) {
  if (color && theme.colors[color]) return theme.colors[color];
  if (color) return color; // allow a raw hex/rgba override
  if (onInverse) return muted ? theme.colors.textOnInverseMuted : theme.colors.textOnInverse;
  if (faint) return theme.colors.textFaint;
  if (muted) return theme.colors.textMuted;
  return theme.colors.text;
}

export default function Text({ variant = 'body', color, muted = false, faint = false, onInverse = false, center = false, weight, style, children, ...rest }) {
  const theme = useTheme();
  const t = theme.type[variant] || theme.type.body;

  return (
    <RNText
      style={[
        {
          fontSize: t.fontSize,
          lineHeight: t.lineHeight,
          fontWeight: weight ? theme.fontWeight[weight] || weight : t.weight,
          letterSpacing: t.tracking,
          color: resolveColor(theme, color, muted, faint, onInverse),
          textAlign: center ? 'center' : undefined
        },
        style
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}
