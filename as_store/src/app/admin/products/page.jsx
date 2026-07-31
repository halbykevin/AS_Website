'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Button, Card, Badge, Spinner, Input, Toggle, Checkbox } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { useSelection } from '@/components/admin/useSelection.js'
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

  const sel = useSelection(list)
  const bulkRemove = useMutation({
    mutationFn: (ids) => Promise.all(ids.map((id) => adminApi.deleteProduct(id))),
    onSuccess: (_d, ids) => {
      invalidate()
      sel.clear()
      toast.success(`${ids.length} product${ids.length > 1 ? 's' : ''} deleted`)
    },
    onError: (e) => toast.error(e.message),
  })
  const onBulkDelete = () => {
    const ids = sel.selectedIds
    if (ids.length && confirm(`Delete ${ids.length} selected product${ids.length > 1 ? 's' : ''}? This can't be undone.`))
      bulkRemove.mutate(ids)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-text/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-admin-text/45">{list.length} products</span>
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
          <p className="py-16 text-center text-sm text-admin-text/50">No products found.</p>
        ) : (
          <>
            {/* Bulk-select bar */}
            <div className="flex items-center justify-between gap-3 border-b border-admin-line/5 bg-admin-bg/40 px-3 py-2.5 sm:px-4">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-admin-text/60">
                <Checkbox checked={sel.all} indeterminate={sel.indeterminate} onChange={sel.toggleAll} />
                {sel.count > 0 ? `${sel.count} selected` : 'Select all'}
              </label>
              {sel.count > 0 && (
                <Button variant="danger" onClick={onBulkDelete} disabled={bulkRemove.isPending} className="px-3 py-1.5">
                  <Icon name="trash" className="h-4 w-4" />
                  {bulkRemove.isPending ? 'Deleting…' : `Delete ${sel.count}`}
                </Button>
              )}
            </div>
            <ul className="divide-y divide-admin-line/5">
              {list.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-3 hover:bg-admin-bg/50 sm:px-4 ${
                    sel.has(p.id) ? 'bg-as-red/5' : ''
                  }`}
                >
                  <Checkbox checked={sel.has(p.id)} onChange={() => sel.toggle(p.id)} />
                {/* Thumb */}
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-admin-bg">
                  {p.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="h-full w-full object-cover" />
                  )}
                </span>

                {/* Name + meta (truncates, takes remaining space) */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="block truncate font-medium text-admin-text hover:text-as-red"
                    title={p.name}
                  >
                    {p.name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-admin-text/45">
                    {p.brand ? <span className="font-medium text-admin-text/60">{p.brand}</span> : null}
                    {p.brand ? ' · ' : ''}
                    {p.category || 'Uncategorized'} ·{' '}
                    <span className="font-semibold text-admin-text/70">
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
                  <span className="hidden text-xs text-admin-text/45 lg:inline">Featured</span>
                  <Toggle
                    checked={p.featured}
                    onChange={(v) => toggle.mutate({ id: p.id, patch: { featured: v } })}
                  />
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-0.5">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="rounded-lg p-2 text-admin-text/60 hover:bg-admin-surface hover:text-as-red"
                    title="Edit"
                  >
                    <Icon name="pencil" className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${p.name}"? This can't be undone.`)) remove.mutate(p.id)
                    }}
                    className="rounded-lg p-2 text-admin-text/60 hover:bg-admin-surface hover:text-red-600"
                    title="Delete"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}
