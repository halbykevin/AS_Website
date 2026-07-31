'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import {
  Button,
  Card,
  Badge,
  Spinner,
  Field,
  Input,
  Select,
  Toggle,
  Modal,
  Checkbox,
} from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'

const SCOPES = [
  { value: 'all', label: 'Whole store' },
  { value: 'category', label: 'A category' },
  { value: 'brand', label: 'A brand' },
  { value: 'products', label: 'Specific products' },
]

const BLANK = {
  name: '',
  percent: 10,
  scope: 'all',
  categoryId: null,
  brandId: null,
  productIds: [],
  startsAt: null,
  endsAt: null,
  active: true,
}

// ISO <-> <input type="datetime-local"> (which wants local time, no zone).
const toInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromInput = (v) => (v ? new Date(v).toISOString() : null)

// Live / Scheduled / Ended / Off, matching how the API applies the sale.
function saleStatus(s) {
  if (!s.active) return { label: 'Off', tone: 'gray' }
  const now = Date.now()
  if (s.startsAt && new Date(s.startsAt).getTime() > now) return { label: 'Scheduled', tone: 'amber' }
  if (s.endsAt && new Date(s.endsAt).getTime() <= now) return { label: 'Ended', tone: 'gray' }
  return { label: 'Live', tone: 'green' }
}

const fmtDate = (iso) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function SalesPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'sales'], queryFn: adminApi.listSales })
  const { data: categories } = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.listCategories })
  const { data: brands } = useQuery({ queryKey: ['admin', 'brands'], queryFn: adminApi.listBrands })
  const { data: products } = useQuery({ queryKey: ['admin', 'products'], queryFn: adminApi.listProducts })
  const [editing, setEditing] = useState(null)
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'sales'] })
    // Prices shown in the products table change with the sale.
    qc.invalidateQueries({ queryKey: ['admin', 'products'] })
  }

  const catName = (id) => categories?.find((c) => c.id === id)?.name || `#${id}`
  const brandName = (id) => brands?.find((b) => b.id === id)?.name || `#${id}`
  const scopeLabel = (s) => {
    if (s.scope === 'category') return `Category: ${catName(s.categoryId)}`
    if (s.scope === 'brand') return `Brand: ${brandName(s.brandId)}`
    if (s.scope === 'products')
      return `${s.productIds.length} product${s.productIds.length === 1 ? '' : 's'}`
    return 'Whole store'
  }

  const toggleActive = useMutation({
    mutationFn: ({ id, active }) => adminApi.updateSale(id, { active }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (id) => adminApi.deleteSale(id),
    onSuccess: () => {
      invalidate()
      toast.success('Sale deleted — prices restored')
    },
    onError: (e) => toast.error(e.message),
  })

  const list = data ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-admin-text/50">
          Run a discount on the whole store, a category, a brand or hand-picked products. Shoppers
          see the old price crossed out next to the sale price.
        </p>
        <Button onClick={() => setEditing(BLANK)}>
          <Icon name="plus" className="h-4 w-4" /> New sale
        </Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <p className="py-16 text-center text-sm text-admin-text/50">
            No sales yet. Create one to discount part (or all) of the store.
          </p>
        ) : (
          <ul className="divide-y divide-admin-line/5">
            {list.map((s) => {
              const status = saleStatus(s)
              return (
                <li key={s.id} className="flex items-center gap-4 px-5 py-3 hover:bg-admin-bg/60">
                  <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg bg-as-red/10 text-sm font-bold text-as-red">
                    −{s.percent}%
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-admin-text">{s.name}</p>
                    <p className="truncate text-xs text-admin-text/45">
                      {scopeLabel(s)}
                      {s.startsAt && ` · from ${fmtDate(s.startsAt)}`}
                      {s.endsAt && ` · until ${fmtDate(s.endsAt)}`}
                    </p>
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <Toggle
                    checked={s.active}
                    onChange={(v) => toggleActive.mutate({ id: s.id, active: v })}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditing(s)}
                      className="rounded-lg p-2 text-admin-text/60 hover:bg-admin-surface hover:text-as-red"
                      title="Edit"
                    >
                      <Icon name="pencil" className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${s.name}"? Prices go back to normal immediately.`))
                          remove.mutate(s.id)
                      }}
                      className="rounded-lg p-2 text-admin-text/60 hover:bg-admin-surface hover:text-red-600"
                      title="Delete"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {editing && (
        <SaleModal
          sale={editing}
          categories={categories ?? []}
          brands={brands ?? []}
          products={products ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            invalidate()
          }}
        />
      )}
    </div>
  )
}

function SaleModal({ sale, categories, brands, products, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(sale?.id)
  const [form, setForm] = useState({ ...BLANK, ...sale })
  const [saving, setSaving] = useState(false)
  const [productSearch, setProductSearch] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const shownProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => p.name.toLowerCase().includes(q))
  }, [products, productSearch])

  const toggleProduct = (id) =>
    set(
      'productIds',
      form.productIds.includes(id)
        ? form.productIds.filter((x) => x !== id)
        : [...form.productIds, id],
    )

  const save = async () => {
    if (!form.name.trim()) return toast.error('Give the sale a name')
    const pct = Math.round(Number(form.percent))
    if (!pct || pct < 1 || pct > 90) return toast.error('Discount must be between 1 and 90%')
    if (form.scope === 'category' && !form.categoryId) return toast.error('Pick a category')
    if (form.scope === 'brand' && !form.brandId) return toast.error('Pick a brand')
    if (form.scope === 'products' && form.productIds.length === 0)
      return toast.error('Pick at least one product')
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      percent: pct,
      scope: form.scope,
      categoryId: form.scope === 'category' ? Number(form.categoryId) : null,
      brandId: form.scope === 'brand' ? Number(form.brandId) : null,
      productIds: form.scope === 'products' ? form.productIds : [],
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      active: form.active,
    }
    try {
      if (editing) await adminApi.updateSale(sale.id, payload)
      else await adminApi.createSale(payload)
      toast.success(editing ? 'Sale saved' : 'Sale created')
      onSaved()
    } catch (e) {
      toast.error(e.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit sale' : 'New sale'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Summer sale"
              autoFocus
            />
          </Field>
          <Field label="Discount %">
            <Input
              type="number"
              min={1}
              max={90}
              value={form.percent}
              onChange={(e) => set('percent', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Applies to">
          <Select value={form.scope} onChange={(e) => set('scope', e.target.value)}>
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>

        {form.scope === 'category' && (
          <Field label="Category">
            <Select value={form.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || null)}>
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {form.scope === 'brand' && (
          <Field label="Brand">
            <Select value={form.brandId ?? ''} onChange={(e) => set('brandId', e.target.value || null)}>
              <option value="">Choose a brand…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {form.scope === 'products' && (
          <Field
            label="Products"
            hint={`${form.productIds.length} selected`}
          >
            <div className="space-y-2">
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products…"
              />
              <div className="max-h-56 overflow-y-auto rounded-lg border border-admin-line/10">
                {shownProducts.length === 0 ? (
                  <p className="p-4 text-center text-xs text-admin-text/40">No products match.</p>
                ) : (
                  shownProducts.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-admin-line/5 px-3 py-2 last:border-0 hover:bg-admin-bg/60"
                    >
                      <Checkbox
                        checked={form.productIds.includes(p.id)}
                        onChange={() => toggleProduct(p.id)}
                      />
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
                      ) : (
                        <span className="h-8 w-8 shrink-0 rounded bg-admin-bg" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-admin-text">{p.name}</span>
                      <span className="text-xs text-admin-text/45">${Number(p.oldPrice ?? p.price).toLocaleString()}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" hint="Empty = right away">
            <Input
              type="datetime-local"
              value={toInput(form.startsAt)}
              onChange={(e) => set('startsAt', fromInput(e.target.value))}
            />
          </Field>
          <Field label="Ends" hint="Empty = until you turn it off">
            <Input
              type="datetime-local"
              value={toInput(form.endsAt)}
              onChange={(e) => set('endsAt', fromInput(e.target.value))}
            />
          </Field>
        </div>

        <Toggle checked={form.active} onChange={(v) => set('active', v)} label="Active" />
      </div>
    </Modal>
  )
}
