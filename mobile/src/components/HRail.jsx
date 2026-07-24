// Horizontal snapping rail — renders children (or maps `data`) in a horizontal
// ScrollView with consistent gutters. Used for product rails, category rails and
// event rails so they all scroll and pad identically.

import { ScrollView, View } from 'react-native'
import { useTheme } from '@/src/theme'

export default function HRail({ children, data, renderItem, itemWidth = 260, gap, edgePadding }) {
  const theme = useTheme()
  const spacing = gap ?? theme.spacing.md
  const pad = edgePadding ?? theme.layout.screenPadding

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: pad, gap: spacing }}
      // Negative margin cancels the parent Screen gutter so the rail bleeds to
      // the edges while items still start aligned with the page content.
      style={{ marginHorizontal: -pad }}
    >
      {data
        ? data.map((item, i) => (
            <View key={item.id ?? i} style={{ width: itemWidth }}>
              {renderItem(item, i)}
            </View>
          ))
        : children}
    </ScrollView>
  )
}
