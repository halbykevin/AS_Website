// TanStack React Query hooks over the store API.
//
// Tuned for a fast-feeling app: results stay fresh for minutes (tab hops and
// back-navigation render instantly from cache), `keepPreviousData` stops lists
// from blanking while a refetch runs, and the whole cache is persisted to
// AsyncStorage (see AppProviders) so a relaunch paints immediately.

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { loadProducts, loadProduct, loadCategories, loadBrands } from './storeApi'

export function useProducts(filters = {}) {
  const key = ['products', filters.category || 'all', filters.featured || 0, filters.search || '', filters.limit || 0]
  return useQuery({
    queryKey: key,
    queryFn: () => loadProducts(filters),
    placeholderData: keepPreviousData,
  })
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: loadCategories, placeholderData: keepPreviousData })
}

export function useBrands() {
  return useQuery({ queryKey: ['brands'], queryFn: loadBrands, placeholderData: keepPreviousData })
}

export function useProduct(slug) {
  return useQuery({ queryKey: ['product', slug], queryFn: () => loadProduct(slug), enabled: Boolean(slug) })
}
