// React Query hooks over the store API — each cache key is independent so rails,
// grids and detail screens cache separately. The web store used the same pattern.

import { useQuery } from '@tanstack/react-query'
import { loadProducts, loadProduct, loadCategories, loadBrands } from './storeApi'

export function useProducts(filters = {}) {
  const key = ['products', filters.category || 'all', filters.featured || 0, filters.search || '', filters.limit || 0]
  return useQuery({ queryKey: key, queryFn: () => loadProducts(filters) })
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: loadCategories })
}

export function useBrands() {
  return useQuery({ queryKey: ['brands'], queryFn: loadBrands })
}

export function useProduct(slug) {
  return useQuery({ queryKey: ['product', slug], queryFn: () => loadProduct(slug), enabled: Boolean(slug) })
}
