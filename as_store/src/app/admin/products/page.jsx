'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Button, Card, Badge, Spinner, Input, Select, Toggle, Checkbox } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { useSelection } from '@/components/admin/useSelection.js'
import { adminApi } from '@/lib/adminApi'

// Sentinel for "products with no brand / no category set" — real names never
// look like this, so it can't collide with a facet value.
const NONE = '__none__'

// No stock filter on purpose: `products.stock` is not maintained — bulk imports
// default it to 0, nothing decrements it on an order, and the storefront treats
// any visible product as sellable. Filtering on it would just return the whole
// catalogue. Add it back the day the catalogue carries real inventory.
const STATUSES = [
  { value: '', label: 'Any status' },
  { value: 'visible', label: 'Visible' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'featured', label: 'Featured' },
  { value: 'sale', label: 'On sale' },
  { value: 'new', label: 'New' },
]

const statusMatch = {
  visible: (p) => p.visible,
  hidden: (p) => !p.visible,
  featured: (p) => p.featured,
  sale: (p) => Boolean(p.salePercent) || Number(p.oldPrice) > Number(p.price),
  new: (p) => p.isNew,
}

// `default` keeps whatever order the API returned (p.sort, p.id — the display
// order the storefront uses), so the page opens exactly as it always has.
const SORTS = [
  { value: 'default', label: 'Display order' },
  { value: 'name', label: 'Name' },
  { value: 'price', label: 'Price' },
  { value: 'brand', label: 'Brand' },
  { value: 'category', label: 'Category' },
  { value: 'added', label: 'Date added' },
]

const byName = (a, b) => a.name.localeCompare(b.name)
const comparators = {
  name: byName,
  price: (a, b) => Number(a.price) - Number(b.price) || byName(a, b),
  brand: (a, b) => (a.brand || '').localeCompare(b.brand || '') || byName(a, b),
  category: (a, b) => (a.category || '').localeCompare(b.category || '') || byName(a, b),
  added: (a, b) => a.id - b.id, // ids are serial, so id order is creation order
}

// Descending is the useful default for these; A→Z for everything else.
const defaultDir = (sort) => (sort === 'added' || sort === 'price' ? 'desc' : 'asc')

/** Distinct values of `key` across the products, each with how many carry it. */
function facets(products, key) {
  const counts = new Map()
  for (const p of products) {
    const name = (p[key] || '').trim()
    counts.set(name || NONE, (counts.get(name || NONE) || 0) + 1)
  }
  const none = counts.get(NONE)
  counts.delete(NONE)
  const list = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  if (none) list.push([NONE, none])
  return list
}

export default function ProductsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('default')
  const [dir, setDir] = useState('asc')

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

  const all = data ?? []
  const brands = useMemo(() => facets(all, 'brand'), [all])
  const categories = useMemo(() => facets(all, 'category'), [all])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    const hit = (p) =>
      !q ||
      [p.name, p.brand, p.category, p.slug].some((v) => (v || '').toLowerCase().includes(q))
    const brandOk = (p) => !brand || (brand === NONE ? !p.brand : p.brand === brand)
    const catOk = (p) => !category || (category === NONE ? !p.category : p.category === category)
    const statusOk = (p) => !status || statusMatch[status]?.(p)

    const rows = all.filter((p) => hit(p) && brandOk(p) && catOk(p) && statusOk(p))
    const cmp = comparators[sort]
    if (cmp) rows.sort(dir === 'desc' ? (a, b) => cmp(b, a) : cmp)
    return rows
  }, [all, search, brand, category, status, sort, dir])

  const onSortChange = (value) => {
    setSort(value)
    setDir(defaultDir(value))
  }

  const filtered = search || brand || category || status
  const clearFilters = () => {
    setSearch('')
    setBrand('')
    setCategory('')
    setStatus('')
  }

  const sel = useSelection(list)
  // Only ever act on rows the admin can actually see — otherwise a bulk delete
  // after narrowing the filters would take out products that scrolled out of view.
  const selectedIds = list.filter((p) => sel.has(p.id)).map((p) => p.id)

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
    const ids = selectedIds
    if (ids.length && confirm(`Delete ${ids.length} selected product${ids.length > 1 ? 's' : ''}? This can't be undone.`))
      bulkRemove.mutate(ids)
  }

  // "Call for price" on a whole selection. This is how the feature is actually
  // used: filter to a brand and a category (Apple → Laptops), select all, flip.
  // One request, not one per product.
  const bulkCallForPrice = useMutation({
    mutationFn: ({ ids, on }) => adminApi.bulkCallForPrice(ids, on),
    onSuccess: (r) => {
      invalidate()
      sel.clear()
      toast.success(
        r.callForPrice
          ? `${r.updated} product${r.updated > 1 ? 's' : ''} now show “call for price”`
          : `${r.updated} product${r.updated > 1 ? 's' : ''} show their price again`,
      )
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-text/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, brand or category…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-admin-text/45">
            {filtered ? `${list.length} of ${all.length}` : `${all.length}`} product{all.length === 1 ? '' : 's'}
          </span>
          <Button as={Link} href="/admin/products/new">
            <Icon name="plus" className="h-4 w-4" /> New product
          </Button>
        </div>
      </div>

      {/* Filter + sort row */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={brand} onChange={(e) => setBrand(e.target.value)} className="w-auto">
          <option value="">All brands</option>
          {brands.map(([name, n]) => (
            <option key={name} value={name}>
              {name === NONE ? 'No brand' : name} ({n})
            </option>
          ))}
        </Select>

        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto">
          <option value="">All categories</option>
          {categories.map(([name, n]) => (
            <option key={name} value={name}>
              {name === NONE ? 'Uncategorized' : name} ({n})
            </option>
          ))}
        </Select>

        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Select value={sort} onChange={(e) => onSortChange(e.target.value)} className="w-auto">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </Select>

        {sort !== 'default' && (
          <button
            onClick={() => setDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            title={dir === 'desc' ? 'Descending' : 'Ascending'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-admin-line/15 bg-admin-surface px-3 py-2 text-sm font-medium text-admin-text/70 hover:bg-admin-bg"
          >
            <Icon name="sort" className="h-4 w-4" />
            {dir === 'desc' ? 'Desc' : 'Asc'}
          </button>
        )}

        {filtered && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-admin-text/55 hover:text-as-red"
          >
            <Icon name="close" className="h-4 w-4" /> Clear filters
          </button>
        )}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <p className="py-16 text-center text-sm text-admin-text/50">
            {all.length ? 'No products match these filters.' : 'No products found.'}
          </p>
        ) : (
          <>
            {/* Bulk-select bar */}
            <div className="flex items-center justify-between gap-3 border-b border-admin-line/5 bg-admin-bg/40 px-3 py-2.5 sm:px-4">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-admin-text/60">
                <Checkbox checked={sel.all} indeterminate={sel.indeterminate} onChange={sel.toggleAll} />
                {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
              </label>
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => bulkCallForPrice.mutate({ ids: selectedIds, on: true })}
                    disabled={bulkCallForPrice.isPending}
                    className="px-3 py-1.5"
                    title="Hide the price and show an enquiry button on these products"
                  >
                    <Icon name="whatsapp" className="h-4 w-4" />
                    Call for price
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => bulkCallForPrice.mutate({ ids: selectedIds, on: false })}
                    disabled={bulkCallForPrice.isPending}
                    className="px-3 py-1.5"
                    title="Show the price again on these products"
                  >
                    Show price
                  </Button>
                  <Button variant="danger" onClick={onBulkDelete} disabled={bulkRemove.isPending} className="px-3 py-1.5">
                    <Icon name="trash" className="h-4 w-4" />
                    {bulkRemove.isPending ? 'Deleting…' : `Delete ${selectedIds.length}`}
                  </Button>
                </div>
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
                    {/* The list keeps showing the real price — staff need it —
                        with a marker saying the storefront does not. */}
                    {p.callForPrice ? (
                      <span className="ml-1.5 rounded-full bg-as-red/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-as-red">
                        Call for price
                      </span>
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
