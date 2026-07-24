// Shown in place of the storefront when settings.published is false — the app
// parallel of the web store's Coming Soon gate.

import { View } from 'react-native'
import { Image } from 'expo-image'
import { useTheme } from '@/src/theme'
import Text from '@/src/ui/Text'
import Icon from '@/src/ui/Icon'

const LOGO = require('../../assets/as-store-logo-clear.png')

export default function ComingSoon({ settings }) {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing['3xl'], gap: theme.spacing.lg }}>
      <Image source={LOGO} style={{ width: 160, height: 80 }} contentFit="contain" />
      <Icon name="sparkles" size={32} color={theme.colors.primary} />
      <Text variant="h1" center>
        {settings?.storeName || 'AS Store'} is coming soon
      </Text>
      <Text variant="body" muted center>
        We're putting the finishing touches on the store. Check back shortly — the latest tech, gadgets and accessories are on their way.
      </Text>
    </View>
  )
}
