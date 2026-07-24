// Tappable pseudo search field — the modern commerce-app entry point to search.
// Looks like an input, but just opens the /search modal.

import { Pressable } from 'react-native'
import { router } from 'expo-router'
import { useTheme, useThemedStyles } from '@/src/theme'
import Text from '@/src/ui/Text'
import Icon from '@/src/ui/Icon'

export default function SearchPill({ label = 'Search products, brands…', style }) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  return (
    <Pressable
      accessibilityRole="search"
      onPress={() => router.push('/search')}
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }, style]}
    >
      <Icon name="search" size={18} color={theme.colors.textFaint} />
      <Text variant="body" faint numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Text>
    </Pressable>
  )
}

const makeStyles = (t) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    backgroundColor: t.colors.surfaceAlt,
    borderRadius: t.radii.pill,
    paddingHorizontal: t.spacing.lg,
    height: 46,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
})
