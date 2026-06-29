'use client'

import { useQuery } from '@tanstack/react-query'
import { getProducts } from './products'

// React Query hook. Query key includes the category + limit so each rail caches
// independently. When the backend lands, only getProducts() changes.
export function useProducts(category = 'All', limit = 0) {
  return useQuery({
    queryKey: ['products', category, limit],
    queryFn: () => getProducts({ category, limit: limit || undefined }),
  })
}
