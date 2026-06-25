'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Button, Card, Badge, Spinner, Input, Toggle } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'

export default function ProductsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['admin', 'products'], queryFn: adminApi.listProducts })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'products'] })

  const toggle = useMutation({
    mutationFn: ({ id, patch }) => adminApi.updateProduct(id, patch),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: (id) => adminApi.deleteProduct(id),
    onSuccess: () => {
      invalidate()
      toast.success('Product deleted')
    },
    onError: (e) => toast.error(e.message),
  })

  const q = search.toLowerCase()
  const list = (data ?? []).filter(
    (p) => p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q),
  )

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-as-ink/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-as-ink/45">{list.length} products</span>
          <Button as={Link} href="/admin/products/new">
            <Icon name="plus" className="h-4 w-4" /> New product
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <p className="py-16 text-center text-sm text-as-ink/50">No products found.</p>
        ) : (
          <ul className="divide-y divide-as-ink/5">
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-3 hover:bg-as-fog/50 sm:px-4">
                {/* Thumb */}
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-as-fog">
                  {p.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="h-full w-full object-cover" />
                  )}
                </span>

                {/* Name + meta (truncates, takes remaining space) */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="block truncate font-medium text-as-ink hover:text-as-red"
                    title={p.name}
                  >
                    {p.name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-as-ink/45">
                    {p.brand ? <span className="font-medium text-as-ink/60">{p.brand}</span> : null}
                    {p.brand ? ' · ' : ''}
                    {p.category || 'Uncategorized'} ·{' '}
                    <span className="font-semibold text-as-ink/70">
                      ${Number(p.price).toLocaleString()}
                    </span>
                    {p.oldPrice ? (
                      <span className="ml-1 line-through">${Number(p.oldPrice).toLocaleString()}</span>
                    ) : null}
                  </p>
                </div>

                {/* Status */}
                {!p.visible && (
                  <Badge tone="gray">
                    <span className="hidden sm:inline">Hidden</span>
                    <span className="sm:hidden">×</span>
                  </Badge>
                )}

                {/* Featured toggle */}
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs text-as-ink/45 lg:inline">Featured</span>
                  <Toggle
                    checked={p.featured}
                    onChange={(v) => toggle.mutate({ id: p.id, patch: { featured: v } })}
                  />
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-0.5">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="rounded-lg p-2 text-as-ink/60 hover:bg-white hover:text-as-red"
                    title="Edit"
                  >
                    <Icon name="pencil" className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${p.name}"? This can't be undone.`)) remove.mutate(p.id)
                    }}
                    className="rounded-lg p-2 text-as-ink/60 hover:bg-white hover:text-red-600"
                    title="Delete"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
