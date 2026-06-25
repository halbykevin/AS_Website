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

  const list = (data ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="mx-auto max-w-6xl space-y-5">
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
        <Button as={Link} href="/admin/products/new">
          <Icon name="plus" className="h-4 w-4" /> New product
        </Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <p className="py-16 text-center text-sm text-as-ink/50">No products found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-as-ink/10 text-left text-xs uppercase tracking-wide text-as-ink/45">
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Featured</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-as-ink/5">
                {list.map((p) => (
                  <tr key={p.id} className="hover:bg-as-fog/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-as-fog">
                          {p.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image} alt="" className="h-full w-full object-cover" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-as-ink">{p.name}</p>
                          <p className="truncate text-xs text-as-ink/40">/{p.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-as-ink/70">{p.category || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-as-ink">
                      ${Number(p.price).toLocaleString()}
                      {p.oldPrice && (
                        <span className="ml-1 text-xs font-normal text-as-ink/40 line-through">
                          ${Number(p.oldPrice).toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.visible ? <Badge tone="green">Visible</Badge> : <Badge tone="gray">Hidden</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        checked={p.featured}
                        onChange={(v) => toggle.mutate({ id: p.id, patch: { featured: v } })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
