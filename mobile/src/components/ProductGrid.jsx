// Responsive product grid + loading skeleton. Renders rows of `columns` cells
// (each cell flex:1) so a lone item on the last row keeps its column width
// instead of stretching. Lives inside a parent ScrollView, so it composes with
// other page sections rather than being its own FlatList.

import { View } from 'react-native'
import { useTheme } from '@/src/theme'
import ProductTile from './ProductTile'
import Skeleton from '@/src/ui/Skeleton'
import EmptyState from '@/src/ui/EmptyState'

const chunk = (arr, size) => {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function Row({ children, gap }) {
  return <View style={{ flexDirection: 'row', gap }}>{children}</View>
}

export default function ProductGrid({ products, loading, emptyMessage = 'No products yet.', columns = 2 }) {
  const theme = useTheme()
  const gap = theme.spacing.md

  if (loading) {
    return (
      <View style={{ gap }}>
        {[0, 1].map((r) => (
          <Row key={r} gap={gap}>
            {Array.from({ length: columns }).map((_, i) => (
              <View key={i} style={{ flex: 1 }}>
                <Skeleton height={300} radius="3xl" />
              </View>
            ))}
          </Row>
        ))}
      </View>
    )
  }

  if (!products?.length) {
    return <EmptyState icon="bag" message={emptyMessage} />
  }

  const rows = chunk(products, columns)

  return (
    <View style={{ gap }}>
      {rows.map((row, r) => (
        <Row key={r} gap={gap}>
          {row.map((p) => (
            <View key={p.id} style={{ flex: 1 }}>
              <ProductTile product={p} fluid />
            </View>
          ))}
          {/* pad the last row so remaining cells keep their width */}
          {row.length < columns
            ? Array.from({ length: columns - row.length }).map((_, i) => <View key={`pad-${i}`} style={{ flex: 1 }} />)
            : null}
        </Row>
      ))}
    </View>
  )
}
