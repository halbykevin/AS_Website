'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Button, Card, Badge, Spinner, Field, Input, Textarea, Toggle, Modal } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const BLANK = { title: '', slug: '', body: '', visible: true, sort: 0 }

export default function PagesPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'pages'], queryFn: adminApi.listPages })
  const [editing, setEditing] = useState(null)
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'pages'] })

  const remove = useMutation({
    mutationFn: (id) => adminApi.deletePage(id),
    onSuccess: () => {
      invalidate()
      toast.success('Page deleted')
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-as-ink/50">Content pages like About, Contact, Shipping — linkable from the nav &amp; footer.</p>
        <Button onClick={() => setEditing(BLANK)}>
          <Icon name="plus" className="h-4 w-4" /> New page
        </Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (data ?? []).length === 0 ? (
          <p className="py-16 text-center text-sm text-as-ink/50">No pages yet.</p>
        ) : (
          <ul className="divide-y divide-as-ink/5">
            {data.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-5 py-3 hover:bg-as-fog/60">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-as-fog text-as-ink/40">
                  <Icon name="file" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-as-ink">{p.title}</p>
                  <p className="truncate text-xs text-as-ink/40">/pages/{p.slug}</p>
                </div>
                {p.visible ? <Badge tone="green">Visible</Badge> : <Badge tone="gray">Hidden</Badge>}
                <div className="flex items-center gap-1">
                  <a
                    href={`/pages/${p.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg p-2 text-as-ink/60 hover:bg-white hover:text-as-red"
                    title="View"
                  >
                    <Icon name="eye" className="h-4 w-4" />
                  </a>
                  <button
                    onClick={() => setEditing(p)}
                    className="rounded-lg p-2 text-as-ink/60 hover:bg-white hover:text-as-red"
                    title="Edit"
                  >
                    <Icon name="pencil" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${p.title}"?`)) remove.mutate(p.id)
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
        <PageModal
          page={editing}
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

function PageModal({ page, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(page?.id)
  const [form, setForm] = useState({ ...BLANK, ...page })
  const [saving, setSaving] = useState(false)
  const slugTouched = useRef(editing)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const onTitle = (v) => {
    set('title', v)
    if (!slugTouched.current) set('slug', slugify(v))
  }

  const save = async () => {
    if (!form.title.trim()) return toast.error('Title is required')
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim() || slugify(form.title),
      body: form.body,
      visible: form.visible,
      sort: Number(form.sort) || 0,
    }
    try {
      if (editing) await adminApi.updatePage(page.id, payload)
      else await adminApi.createPage(payload)
      toast.success(editing ? 'Page saved' : 'Page created')
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
      title={editing ? 'Edit page' : 'New page'}
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
        <Field label="Title">
          <Input value={form.title} onChange={(e) => onTitle(e.target.value)} placeholder="About AS Store" autoFocus />
        </Field>
        <Field label="Slug" hint="The page lives at /pages/<slug>.">
          <Input
            value={form.slug}
            onChange={(e) => {
              slugTouched.current = true
              set('slug', e.target.value)
            }}
            placeholder="about"
          />
        </Field>
        <Field label="Body" hint="Plain text. Blank lines start a new paragraph.">
          <Textarea
            value={form.body}
            onChange={(e) => set('body', e.target.value)}
            className="min-h-[220px]"
            placeholder="Write your page content here…"
          />
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
