// The app's button — the RN equivalent of the web `.pill` / `.pill-ghost`.
// Variants keep every CTA on-brand: primary (AS red pill), ghost (outline),
// inverse (on dark chrome), subtle (fog), link (text + chevron).

import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme, useThemedStyles } from '@/src/theme';
import Text from './Text';
import Icon from './Icon';

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon, // leading icon name
  iconRight, // trailing icon name
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  ...rest
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isDisabled = disabled || loading;

  const v = styles[variant] || styles.primary;
  const s = styles[`size_${size}`] || styles.size_md;
  const textColor = variant === 'primary' ? 'textOnPrimary' : variant === 'inverse' ? 'text' : variant === 'link' ? 'primary' : 'text';
  const textVariant = size === 'sm' ? 'callout' : 'title';

  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: isDisabled, busy: loading }} onPress={isDisabled ? undefined : onPress} hitSlop={theme.layout.hitSlop} style={({ pressed }) => [styles.base, v, s, fullWidth && styles.fullWidth, isDisabled && styles.disabled, pressed && !isDisabled && styles.pressed, style]} {...rest}>
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? theme.colors.textOnPrimary : theme.colors.primary} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={theme.colors[textColor]} /> : null}
          {label ? (
            <Text variant={textVariant} color={textColor} weight="semibold">
              {label}
            </Text>
          ) : null}
          {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 16 : 18} color={theme.colors[textColor]} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const makeStyles = t => ({
  base: {
    borderRadius: t.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row'
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },

  // sizes
  size_sm: { paddingVertical: 8, paddingHorizontal: 16, minHeight: 36 },
  size_md: { paddingVertical: 12, paddingHorizontal: 22, minHeight: 48 },
  size_lg: { paddingVertical: 15, paddingHorizontal: 26, minHeight: 54 },

  // variants
  primary: { backgroundColor: t.colors.primary },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.colors.borderStrong },
  subtle: { backgroundColor: t.colors.surfaceAlt },
  inverse: { backgroundColor: t.colors.white },
  danger: { backgroundColor: t.colors.danger },
  link: { backgroundColor: 'transparent', paddingHorizontal: 0, minHeight: 0, paddingVertical: 4 }
});
