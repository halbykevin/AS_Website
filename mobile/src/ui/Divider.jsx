import { StyleSheet, View } from 'react-native'
import { useTheme } from '@/src/theme'

// Hairline rule that stays crisp across pixel densities.
export default function Divider({ inset = 0, onInverse = false, style }) {
  const theme = useTheme()
  return (
    <View
      style={[
        {
          height: StyleSheet.hairlineWidth,
          backgroundColor: onInverse ? theme.colors.borderOnInverse : theme.colors.border,
          marginHorizontal: inset,
        },
        style,
      ]}
    />
  )
}
