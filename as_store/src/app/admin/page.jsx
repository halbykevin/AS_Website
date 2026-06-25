'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Card, Button, Spinner } from '@/components/admin/ui.jsx'
import { adminApi } from '@/lib/adminApi'

export default function Dashboard() {
  const products = useQuery({ queryKey: ['admin', 'products'], queryFn: adminApi.listProducts })
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.listCategories })

  const list = products.data ?? []
  const stats = [
    { label: 'Products', value: list.length, icon: 'box', href: '/admin/products' },
    { label: 'Categories', value: (categories.data ?? []).length, icon: 'tag', href: '/admin/categories' },
    { label: 'Featured', value: list.filter((p) => p.featured).length, icon: 'star' },
    { label: 'Hidden', value: list.filter((p) => !p.visible).length, icon: 'eyeOff' },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-as-ink">Welcome back 👋</h2>
          <p className="text-sm text-as-ink/50">Here's what's in your store right now.</p>
        </div>
        <Button as={Link} href="/admin/products/new">
          <Icon name="plus" className="h-4 w-4" /> New product
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-as-red/10 text-as-red">
                <Icon name={s.icon} className="h-5 w-5" />
              </span>
              {s.href && (
                <Link href={s.href} className="text-xs font-medium text-as-red hover:underline">
                  View
                </Link>
              )}
            </div>
            <p className="mt-4 text-3xl font-bold text-as-ink">
              {products.isLoading ? '—' : s.value}
            </p>
            <p className="text-sm text-as-ink/50">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Recent products */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-as-ink/10 px-5 py-4">
          <h3 className="font-bold text-as-ink">Recent products</h3>
          <Link href="/admin/products" className="text-sm font-medium text-as-red hover:underline">
            See all
          </Link>
        </div>
        {products.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-as-ink/50">No products yet.</p>
        ) : (
          <ul className="divide-y divide-as-ink/5">
            {list.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-as-fog">
                  <span className="h-11 w-11 overflow-hidden rounded-lg bg-as-fog">
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-as-ink">{p.name}</span>
                    <span className="block text-xs text-as-ink/45">{p.category || 'Uncategorized'}</span>
                  </span>
                  <span className="text-sm font-semibold text-as-ink">${Number(p.price).toLocaleString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
