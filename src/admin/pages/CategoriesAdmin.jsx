import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, TextInput, Toggle, Button, Banner, PageHeader } from '../ui.jsx'

const blank = { name: '', slug: '', imageUrl: '', sort: 0, visible: true }

export default function CategoriesAdmin() {
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [imageFile, setImageFile] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    try {
      setItems(await adminApi.listCategories())
    } catch {
      setMsg({ kind: 'error', text: 'Could not load categories.' })
    }
  }
  useEffect(() => {
    load()
  }, [])

  const startNew = () => {
    setForm({ ...blank, sort: items.length })
    setImageFile(null)
    setEditing('new')
  }
  const startEdit = (r) => {
    setForm({
      name: r.name || '', slug: r.slug || '', imageUrl: r.imageUrl || '',
      sort: r.sort || 0, visible: r.visible !== false,
    })
    setImageFile(null)
    setEditing(r.id)
  }
  const cancel = () => setEditing(null)

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      let imageUrl = form.imageUrl
      if (imageFile) {
        const up = await adminApi.upload(imageFile)
        imageUrl = up.url
      }
      const payload = { ...form, imageUrl, sort: Number(form.sort) }
      if (editing === 'new') await adminApi.createCategory(payload)
      else await adminApi.updateCategory(editing, payload)
      setEditing(null)
      await load()
      setMsg({ kind: 'success', text: 'Saved.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    } finally {
      setSaving(false)
    }
  }

  async function remove(r) {
    if (!confirm(`Delete category “${r.name}”? Events in it keep existing, just uncategorised.`)) return
    await adminApi.deleteCategory(r.id)
    await load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        actions={!editing && <Button onClick={startNew}>+ New category</Button>}
      />

      <Banner kind="info">
        Categories appear as image tiles on the homepage and the Events page. Assign events to a
        category in the Events editor; visitors can then filter events by category.
      </Banner>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {editing && (
        <Card title={editing === 'new' ? 'New category' : 'Edit category'}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><TextInput value={form.name} onChange={set('name')} required placeholder="Concerts" /></Field>
              <Field label="Slug (URL)" hint="Auto-generated from the name if left empty.">
                <TextInput value={form.slug} onChange={set('slug')} placeholder="concerts" />
              </Field>
              <Field label="Sort order"><TextInput type="number" value={form.sort} onChange={set('sort')} /></Field>
            </div>
            <Field label="Tile image" hint="Square or landscape works well. Leave empty to keep the current one.">
              <div className="flex items-center gap-4">
                {(imageFile || form.imageUrl) && (
                  <img
                    src={imageFile ? URL.createObjectURL(imageFile) : form.imageUrl}
                    alt="preview"
                    className="h-16 w-28 rounded object-cover ring-1 ring-black/5"
                  />
                )}
                <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="text-sm" />
              </div>
            </Field>
            <Toggle
              checked={form.visible}
              onChange={(v) => setForm((f) => ({ ...f, visible: v }))}
              label={form.visible ? 'Visible on the site' : 'Hidden'}
              description="Turn off to hide this category tile without deleting it."
            />
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button type="button" variant="ghost" onClick={cancel}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {items.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">No categories yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {r.imageUrl && <img src={r.imageUrl} alt="" className="h-12 w-20 shrink-0 rounded object-cover ring-1 ring-black/5" />}
                  <div className="min-w-0">
                    <p className="font-semibold text-as-charcoal">{r.name}</p>
                    <p className="truncate text-sm text-as-charcoal/55">
                      /{r.slug}{r.visible === false ? ' · hidden' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" onClick={() => startEdit(r)} className="px-3 py-1.5">Edit</Button>
                  <Button variant="danger" onClick={() => remove(r)} className="px-3 py-1.5">Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
