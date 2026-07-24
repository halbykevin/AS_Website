// The AS red announcement strip from store settings (free delivery / warranty).
import { View } from 'react-native'
import { useTheme } from '@/src/theme'
import Text from '@/src/ui/Text'

export default function AnnouncementBar({ announcement }) {
  const theme = useTheme()
  if (!announcement?.enabled || !announcement?.text) return null
  return (
    <View style={{ backgroundColor: theme.colors.primary, paddingVertical: 7, paddingHorizontal: theme.spacing.lg }}>
      <Text variant="caption" color="textOnPrimary" center weight="semibold">
        {announcement.text}
      </Text>
    </View>
  )
}
