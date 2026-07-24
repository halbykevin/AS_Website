// Product search — debounced query, results in a virtualized 2-column FlatList.

import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { loadProducts } from '@/src/lib/storeApi'
import { useTheme } from '@/src/theme'
import { Screen, Text, Icon, EmptyState, Skeleton } from '@/src/ui'
import { Input } from '@/src/ui/Input'
import ProductTile from '@/src/components/ProductTile'

export default function SearchScreen() {
  const theme = useTheme()
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const timer = useRef(null)

  // Debounced search.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const q = term.trim()
    if (q.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    timer.current = setTimeout(async () => {
      const data = await loadProducts({ search: q })
      setResults(data)
      setLoading(false)
      setSearched(true)
    }, 350)
    return () => timer.current && clearTimeout(timer.current)
  }, [term])

  const renderItem = useCallback(
    ({ item }) => (
      <View style={{ flex: 1, maxWidth: '50%' }}>
        <ProductTile product={item} fluid />
      </View>
    ),
    [],
  )
  const keyExtractor = useCallback((item) => String(item.id), [])

  const empty = loading ? (
    <View style={{ gap: theme.spacing.md }}>
      <Skeleton height={20} width="50%" />
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Skeleton height={300} radius="3xl" style={{ flex: 1 }} />
        <Skeleton height={300} radius="3xl" style={{ flex: 1 }} />
      </View>
    </View>
  ) : searched ? (
    <EmptyState icon="search" title="No matches" message={`Nothing found for "${term.trim()}". Try a different term.`} />
  ) : (
    <EmptyState icon="search" message="Search the AS Store for smartphones, audio, computing and more." />
  )

  return (
    <Screen edges={['top']} scroll={false} padded={false} contentStyle={{ flex: 1 }}>
      {/* Search bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingHorizontal: theme.layout.screenPadding, paddingVertical: theme.spacing.sm }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.lg }}>
          <Icon name="search" size={18} color={theme.colors.textFaint} />
          <Input
            value={term}
            onChangeText={setTerm}
            placeholder="Search products…"
            autoFocus
            returnKeyType="search"
            style={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 }}
          />
          {term ? (
            <Pressable onPress={() => setTerm('')} hitSlop={theme.layout.hitSlop}>
              <Icon name="close" size={18} color={theme.colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => router.back()} hitSlop={theme.layout.hitSlop}>
          <Text variant="callout" color="primary">
            Cancel
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={loading ? [] : results}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={2}
        columnWrapperStyle={{ gap: theme.spacing.md }}
        contentContainerStyle={{
          paddingHorizontal: theme.layout.screenPadding,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing['4xl'],
          gap: theme.spacing.md,
        }}
        ListHeaderComponent={
          results.length > 0 && !loading ? (
            <Text variant="caption" faint style={{ marginBottom: theme.spacing.sm }}>
              {results.length} result{results.length === 1 ? '' : 's'}
            </Text>
          ) : null
        }
        ListEmptyComponent={empty}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  )
}
