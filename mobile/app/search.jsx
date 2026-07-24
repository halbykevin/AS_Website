// Product search — debounced query against the store API. Presented as a modal.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { loadProducts } from '@/src/lib/storeApi'
import { useTheme } from '@/src/theme'
import { Screen, Text, Icon, EmptyState, Skeleton } from '@/src/ui'
import { Input } from '@/src/ui/Input'
import ProductGrid from '@/src/components/ProductGrid'

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

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
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

      <View style={{ paddingHorizontal: theme.layout.screenPadding, paddingTop: theme.spacing.md }}>
        {loading ? (
          <View style={{ gap: theme.spacing.md }}>
            <Skeleton height={20} width="50%" />
            <Skeleton height={260} radius="3xl" />
          </View>
        ) : searched && results.length === 0 ? (
          <EmptyState icon="search" title="No matches" message={`Nothing found for "${term.trim()}". Try a different term.`} />
        ) : results.length > 0 ? (
          <>
            <Text variant="caption" faint style={{ marginBottom: theme.spacing.md }}>
              {results.length} result{results.length === 1 ? '' : 's'}
            </Text>
            <ProductGrid products={results} loading={false} />
          </>
        ) : (
          <EmptyState icon="search" message="Search the AS Store for smartphones, audio, computing and more." />
        )}
      </View>
    </Screen>
  )
}
