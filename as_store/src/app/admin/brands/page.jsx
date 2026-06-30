'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Button, Card, Badge, Spinner, Field, Input, Toggle, Modal, Checkbox } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { useSelection } from '@/components/admin/useSelection.js'
import { adminApi } from '@/lib/adminApi'

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const BLANK = { name: '', slug: '', imageUrl: '', sort: 0, visible: true }

export default function BrandsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'brands'], queryFn: adminApi.listBrands })
  const [editing, setEditing] = useState(null)
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'brands'] })

  const remove = useMutation({
    mutationFn: (id) => adminApi.deleteBrand(id),
    onSuccess: () => {
      invalidate()
      toast.success('Brand deleted')
    },
    onError: (e) => toast.error(e.message),
  })

  const list = data ?? []
  const sel = useSelection(list)
  const bulkRemove = useMutation({
    mutationFn: (ids) => Promise.all(ids.map((id) => adminApi.deleteBrand(id))),
    onSuccess: (_d, ids) => {
      invalidate()
      sel.clear()
      toast.success(`${ids.length} brand${ids.length > 1 ? 's' : ''} deleted`)
    },
    onError: (e) => toast.error(e.message),
  })
  const onBulkDelete = () => {
    const ids = sel.selectedIds
    if (ids.length && confirm(`Delete ${ids.length} selected brand${ids.length > 1 ? 's' : ''}? Products keep existing but lose the brand.`))
      bulkRemove.mutate(ids)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-as-ink/50">Brands are auto-created when you import products, and editable here.</p>
        <Button onClick={() => setEditing(BLANK)}>
          <Icon name="plus" className="h-4 w-4" /> New brand
        </Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <p className="py-16 text-center text-sm text-as-ink/50">No brands yet. Import products to populate them.</p>
        ) : (
          <>
            {/* Bulk-select bar */}
            <div className="flex items-center justify-between gap-3 border-b border-as-ink/5 bg-as-fog/40 px-5 py-2.5">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-as-ink/60">
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
            <ul className="divide-y divide-as-ink/5">
              {list.map((b) => (
                <li
                  key={b.id}
                  className={`flex items-center gap-4 px-5 py-3 hover:bg-as-fog/60 ${sel.has(b.id) ? 'bg-as-red/5' : ''}`}
                >
                  <Checkbox checked={sel.has(b.id)} onChange={() => sel.toggle(b.id)} />
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-as-fog text-as-ink/40">
                  {b.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon name="bookmark" className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-as-ink">{b.name}</p>
                  <p className="truncate text-xs text-as-ink/40">/{b.slug}</p>
                </div>
                {b.visible ? <Badge tone="green">Visible</Badge> : <Badge tone="gray">Hidden</Badge>}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(b)}
                    className="rounded-lg p-2 text-as-ink/60 hover:bg-white hover:text-as-red"
                    title="Edit"
                  >
                    <Icon name="pencil" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${b.name}"? Products keep existing but lose this brand.`))
                        remove.mutate(b.id)
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
          </>
        )}
      </Card>

      {editing && (
        <BrandModal
          brand={editing}
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

function BrandModal({ brand, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(brand?.id)
  const [form, setForm] = useState({ ...BLANK, ...brand })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const slugTouched = useRef(editing)
  const fileRef = useRef(null)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const onName = (v) => {
    set('name', v)
    if (!slugTouched.current) set('slug', slugify(v))
  }

  const upload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const { url } = await adminApi.upload(file)
      set('imageUrl', url)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required')
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      imageUrl: form.imageUrl,
      sort: Number(form.sort) || 0,
      visible: form.visible,
    }
    try {
      if (editing) await adminApi.updateBrand(brand.id, payload)
      else await adminApi.createBrand(payload)
      toast.success(editing ? 'Brand saved' : 'Brand created')
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
      title={editing ? 'Edit brand' : 'New brand'}
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
        <Field label="Name">
          <Input value={form.name} onChange={(e) => onName(e.target.value)} placeholder="Apple" autoFocus />
        </Field>
        <Field label="Slug">
          <Input
            value={form.slug}
            onChange={(e) => {
              slugTouched.current = true
              set('slug', e.target.value)
            }}
            placeholder="apple"
          />
        </Field>
        <Field label="Logo / image">
          <div className="flex items-center gap-3">
            <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-as-fog ring-1 ring-as-ink/10">
              {form.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="" className="h-full w-full object-cover" />
              )}
            </span>
            <div className="flex-1 space-y-2">
              <Input value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="Image URL" />
              <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                {uploading ? 'Uploading…' : 'Upload image'}
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            </div>
          </div>
        </Field>
        <div className="flex items-center gap-6">
          <Field label="Sort">
            <Input type="number" value={form.sort} onChange={(e) => set('sort', e.target.value)} className="w-24" />
          </Field>
          <div className="pt-6">
            <Toggle checked={form.visible} onChange={(v) => set('visible', v)} label="Visible" />
          </div>
        </div>
      </div>
    </Modal>
  )
}
