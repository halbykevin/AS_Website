// Surface container with the app's rounded corners, border and card shadow.
// `onPress` turns it into a pressable tile (used across the store + events).

import { Pressable, View } from 'react-native'
import { useThemedStyles, useTheme } from '@/src/theme'

export default function Card({
  children,
  onPress,
  elevated = false,
  bordered = true,
  padded = true,
  radius = '2xl',
  style,
  ...rest
}) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const cardStyle = [
    styles.base,
    { borderRadius: theme.radii[radius] ?? theme.radii['2xl'] },
    bordered && styles.bordered,
    padded && styles.padded,
    elevated && theme.shadows.card,
    style,
  ]

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
        {...rest}
      >
        {children}
      </Pressable>
    )
  }
  return (
    <View style={cardStyle} {...rest}>
      {children}
    </View>
  )
}

const makeStyles = (t) => ({
  base: { backgroundColor: t.colors.surface, overflow: 'hidden' },
  bordered: { borderWidth: 1, borderColor: t.colors.border },
  padded: { padding: t.spacing.lg },
  pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
})
