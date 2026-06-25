'use client'

import { useQuery } from '@tanstack/react-query'
import { getProducts } from './products'

// React Query hook. Query key includes the category so each rail caches
// independently. When the backend lands, only getProducts() changes.
export function useProducts(category = 'All') {
  return useQuery({
    queryKey: ['products', category],
    queryFn: () => getProducts({ category }),
  })
}
