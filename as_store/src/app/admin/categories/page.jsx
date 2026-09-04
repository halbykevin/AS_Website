'use client'

import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Button, Card, Badge, Spinner, Field, Input, Select, Toggle, Modal, Checkbox } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { useSelection } from '@/components/admin/useSelection.js'
import { adminApi } from '@/lib/adminApi'

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const BLANK = { name: '', slug: '', tagline: '', imageUrl: '', parentId: null, sort: 0, visible: true, showInNav: false, showOnHome: false }

// Flatten the flat category list into display order: each department followed by
// its subcategories (depth 1). Categories whose parent is missing render as
// top-level so nothing disappears.
function orderForDisplay(list) {
  const byId = new Map(list.map((c) => [c.id, c]))
  const byOrder = (a, b) =>
    (Number(a.sort) || 0) - (Number(b.sort) || 0) || String(a.name).localeCompare(String(b.name))
  const kids = new Map()
  const roots = []
  for (const c of list) {
    if (c.parentId && byId.has(c.parentId)) {
      if (!kids.has(c.parentId)) kids.set(c.parentId, [])
      kids.get(c.parentId).push(c)
    } else {
      roots.push(c)
    }
  }
  const out = []
  for (const r of roots.sort(byOrder)) {
    out.push({ cat: r, depth: 0 })
    for (const k of (kids.get(r.id) || []).sort(byOrder)) out.push({ cat: k, depth: 1 })
  }
  return out
}

export default function CategoriesPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.listCategories })

  const [editing, setEditing] = useState(null) // null | {} (new) | category (edit)
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'categories'] })

  const remove = useMutation({
    mutationFn: (id) => adminApi.deleteCategory(id),
    onSuccess: () => {
      invalidate()
      toast.success('Category deleted')
    },
    onError: (e) => toast.error(e.message),
  })

  const list = data ?? []
  const sel = useSelection(list)
  const bulkRemove = useMutation({
    mutationFn: (ids) => Promise.all(ids.map((id) => adminApi.deleteCategory(id))),
    onSuccess: (_d, ids) => {
      invalidate()
      sel.clear()
      toast.success(`${ids.length} categor${ids.length > 1 ? 'ies' : 'y'} deleted`)
    },
    onError: (e) => toast.error(e.message),
  })
  const onBulkDelete = () => {
    const ids = sel.selectedIds
    if (ids.length && confirm(`Delete ${ids.length} selected categor${ids.length > 1 ? 'ies' : 'y'}? Products keep existing but lose the category.`))
      bulkRemove.mutate(ids)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-admin-text/50">Organize products into shoppable categories.</p>
        <Button onClick={() => setEditing(BLANK)}>
          <Icon name="plus" className="h-4 w-4" /> New category
        </Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <p className="py-16 text-center text-sm text-admin-text/50">No categories yet.</p>
        ) : (
          <>
            {/* Bulk-select bar */}
            <div className="flex items-center justify-between gap-3 border-b border-admin-line/5 bg-admin-bg/40 px-5 py-2.5">
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
              {orderForDisplay(list).map(({ cat: c, depth }) => (
                <li
                  key={c.id}
                  className={`flex items-center gap-4 py-3 pr-5 hover:bg-admin-bg/60 ${sel.has(c.id) ? 'bg-as-red/5' : ''} ${depth ? 'pl-10' : 'pl-5'}`}
                >
                  <Checkbox checked={sel.has(c.id)} onChange={() => sel.toggle(c.id)} />
                {depth > 0 && <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-admin-text/25" />}
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-admin-bg">
                  {c.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-admin-text">{c.name}</p>
                  <p className="truncate text-xs text-admin-text/40">/{c.slug}</p>
                </div>
                {depth === 0 && <Badge tone="gray">Department</Badge>}
                {c.showInNav && <Badge tone="brand">In menu</Badge>}
                {c.showOnHome && <Badge tone="brand">On homepage</Badge>}
                {c.visible ? <Badge tone="green">Visible</Badge> : <Badge tone="gray">Hidden</Badge>}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(c)}
                    className="rounded-lg p-2 text-admin-text/60 hover:bg-admin-surface hover:text-as-red"
                    title="Edit"
                  >
                    <Icon name="pencil" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${c.name}"? Products keep existing but lose this category.`))
                        remove.mutate(c.id)
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

      {editing && (
        <CategoryModal
          category={editing}
          categories={list}
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

function CategoryModal({ category, categories = [], onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(category?.id)
  const [form, setForm] = useState({ ...BLANK, ...category })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const slugTouched = useRef(editing)
  const fileRef = useRef(null)

  // Parent options = top-level departments (2-level model), excluding self.
  const parentOptions = useMemo(
    () => categories.filter((c) => !c.parentId && c.id !== category?.id),
    [categories, category],
  )
  // A category that already has subcategories can't itself be nested (would make
  // 3 levels) — move its children out first.
  const hasChildren = useMemo(
    () => categories.some((c) => c.parentId === category?.id),
    [categories, category],
  )

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
      tagline: form.tagline,
      imageUrl: form.imageUrl,
      parentId: form.parentId ? Number(form.parentId) : null,
      sort: Number(form.sort) || 0,
      visible: form.visible,
      showInNav: form.showInNav,
      showOnHome: form.showOnHome,
    }
    try {
      if (editing) await adminApi.updateCategory(category.id, payload)
      else await adminApi.createCategory(payload)
      toast.success(editing ? 'Category saved' : 'Category created')
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
      title={editing ? 'Edit category' : 'New category'}
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
          <Input value={form.name} onChange={(e) => onName(e.target.value)} placeholder="Smartphones" autoFocus />
        </Field>
        <Field label="Slug">
          <Input
            value={form.slug}
            onChange={(e) => {
              slugTouched.current = true
              set('slug', e.target.value)
            }}
            placeholder="smartphones"
          />
        </Field>
        <Field label="Parent category">
          <Select
            value={form.parentId ?? ''}
            onChange={(e) => set('parentId', e.target.value || null)}
            disabled={hasChildren}
          >
            <option value="">— None (top-level department) —</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-admin-text/45">
            {hasChildren
              ? 'This category has subcategories, so it stays a top-level department. Move its subcategories elsewhere to nest it.'
              : 'Leave as “None” for a department, or pick a parent to make this a subcategory.'}
          </p>
        </Field>
        <Field label="Tagline">
          <Input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="The future, in your pocket." />
        </Field>
        <Field label="Image">
          <div className="flex items-center gap-3">
            <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-admin-bg ring-1 ring-admin-line/10">
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
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </div>
          </div>
        </Field>
        <div className="flex flex-wrap items-center gap-6">
          <Field label="Sort">
            <Input type="number" value={form.sort} onChange={(e) => set('sort', e.target.value)} className="w-24" />
          </Field>
          <div className="pt-6">
            <Toggle checked={form.visible} onChange={(v) => set('visible', v)} label="Visible" />
          </div>
          <div className="pt-6">
            <Toggle checked={form.showInNav} onChange={(v) => set('showInNav', v)} label="Show in menu" />
          </div>
          <div className="pt-6">
            <Toggle checked={form.showOnHome} onChange={(v) => set('showOnHome', v)} label="Show on homepage" />
          </div>
        </div>
        <p className="text-xs text-admin-text/45">
          “Show in menu” features this category in the top navigation. “Show on homepage” gives it its
          own row of products on the storefront homepage — a department also pulls in its
          subcategories’ products. Both orders follow the Sort value. Until at least one category is
          ticked, the homepage falls back to the first few categories.
        </p>
      </div>
    </Modal>
  )
}
