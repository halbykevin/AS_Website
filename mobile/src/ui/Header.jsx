// Reusable top app bar for stack screens: back button, centered title, optional
// right-side actions. Keeps every screen's chrome identical.

import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { useTheme, useThemedStyles } from '@/src/theme'
import Text from './Text'
import Icon from './Icon'

export default function Header({ title, onBack, right, transparent = false, inverse = false }) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const back = onBack || (() => (router.canGoBack() ? router.back() : router.replace('/')))
  const fg = inverse ? 'textOnInverse' : 'text'

  return (
    <View style={[styles.bar, transparent && styles.transparent, inverse && styles.inverse]}>
      <Pressable onPress={back} hitSlop={theme.layout.hitSlop} style={styles.side}>
        <Icon name="chevronLeft" size={26} color={theme.colors[fg]} />
      </Pressable>
      <Text variant="title" color={fg} numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  )
}

const makeStyles = (t) => ({
  bar: {
    height: t.layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.spacing.md,
    backgroundColor: t.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  transparent: { backgroundColor: 'transparent', borderBottomWidth: 0 },
  inverse: { backgroundColor: t.colors.inverse, borderBottomColor: t.colors.borderOnInverse },
  side: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
})
