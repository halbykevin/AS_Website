// expo-image wrapper: memory+disk caching, graceful placeholder while loading,
// and a branded fallback when an image is missing or fails. Every remote image
// in the app goes through this.

import { useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import { useTheme } from '@/src/theme'
import Icon from '@/src/ui/Icon'

export default function RemoteImage({
  uri,
  style,
  contentFit = 'cover',
  radius = 0,
  fallbackIcon = 'box',
  transition = 200,
  ...rest
}) {
  const theme = useTheme()
  const [failed, setFailed] = useState(false)
  const hasImage = Boolean(uri) && !failed

  if (!hasImage) {
    return (
      <View
        style={[
          { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt, borderRadius: radius },
          style,
        ]}
      >
        <Icon name={fallbackIcon} size={28} color={theme.colors.textFaint} />
      </View>
    )
  }

  return (
    <Image
      source={{ uri }}
      style={[{ borderRadius: radius }, style]}
      contentFit={contentFit}
      transition={transition}
      // Aggressive caching: hit RAM first, then disk — a product photo is only
      // ever downloaded once. recyclingKey lets virtualized lists reuse the
      // underlying native view without flashing stale images.
      cachePolicy="memory-disk"
      recyclingKey={uri}
      onError={() => setFailed(true)}
      {...rest}
    />
  )
}
