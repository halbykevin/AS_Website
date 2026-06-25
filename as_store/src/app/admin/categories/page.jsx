'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Button, Card, Badge, Spinner, Field, Input, Toggle, Modal } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const BLANK = { name: '', slug: '', tagline: '', imageUrl: '', sort: 0, visible: true }

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

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-as-ink/50">Organize products into shoppable categories.</p>
        <Button onClick={() => setEditing(BLANK)}>
          <Icon name="plus" className="h-4 w-4" /> New category
        </Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (data ?? []).length === 0 ? (
          <p className="py-16 text-center text-sm text-as-ink/50">No categories yet.</p>
        ) : (
          <ul className="divide-y divide-as-ink/5">
            {data.map((c) => (
              <li key={c.id} className="flex items-center gap-4 px-5 py-3 hover:bg-as-fog/60">
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-as-fog">
                  {c.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-as-ink">{c.name}</p>
                  <p className="truncate text-xs text-as-ink/40">/{c.slug}</p>
                </div>
                {c.visible ? <Badge tone="green">Visible</Badge> : <Badge tone="gray">Hidden</Badge>}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(c)}
                    className="rounded-lg p-2 text-as-ink/60 hover:bg-white hover:text-as-red"
                    title="Edit"
                  >
                    <Icon name="pencil" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${c.name}"? Products keep existing but lose this category.`))
                        remove.mutate(c.id)
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

      {editing && (
        <CategoryModal
          category={editing}
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

function CategoryModal({ category, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(category?.id)
  const [form, setForm] = useState({ ...BLANK, ...category })
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
      tagline: form.tagline,
      imageUrl: form.imageUrl,
      sort: Number(form.sort) || 0,
      visible: form.visible,
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
        <Field label="Tagline">
          <Input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="The future, in your pocket." />
        </Field>
        <Field label="Image">
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
