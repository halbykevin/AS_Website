import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, TextInput, TextArea, Select, Toggle, Button, Banner } from '../ui.jsx'

const blank = {
  eyebrow: '', heading: '', body: '', imageUrl: '',
  buttonLabel: '', buttonUrl: '', theme: 'light', sort: 0, visible: true,
}

export default function SectionsAdmin() {
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [imageFile, setImageFile] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    try {
      setItems(await adminApi.listSections())
    } catch {
      setMsg({ kind: 'error', text: 'Could not load sections.' })
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
      eyebrow: r.eyebrow || '', heading: r.heading || '', body: r.body || '',
      imageUrl: r.imageUrl || '', buttonLabel: r.buttonLabel || '', buttonUrl: r.buttonUrl || '',
      theme: r.theme === 'dark' ? 'dark' : 'light', sort: r.sort || 0, visible: r.visible !== false,
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
      if (editing === 'new') await adminApi.createSection(payload)
      else await adminApi.updateSection(editing, payload)
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
    if (!confirm(`Delete section “${r.heading || 'untitled'}”?`)) return
    await adminApi.deleteSection(r.id)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-as-charcoal">Custom Sections</h1>
        {!editing && <Button onClick={startNew}>+ New section</Button>}
      </div>

      <Banner kind="info">
        Sections you create here are added to the bottom of the homepage, in sort order. Each can
        have an eyebrow label, heading, text, an optional image and an optional button.
      </Banner>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {editing && (
        <Card title={editing === 'new' ? 'New section' : 'Edit section'}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Heading"><TextInput value={form.heading} onChange={set('heading')} required /></Field>
              <Field label="Eyebrow" hint="Small label above the heading (optional).">
                <TextInput value={form.eyebrow} onChange={set('eyebrow')} />
              </Field>
              <Field label="Button label" hint="Leave empty for no button.">
                <TextInput value={form.buttonLabel} onChange={set('buttonLabel')} />
              </Field>
              <Field label="Button link (URL)">
                <TextInput value={form.buttonUrl} onChange={set('buttonUrl')} placeholder="https://... or /events" />
              </Field>
              <Field label="Background">
                <Select value={form.theme} onChange={set('theme')}>
                  <option value="light">Light</option>
                  <option value="dark">Dark (charcoal)</option>
                </Select>
              </Field>
              <Field label="Sort order"><TextInput type="number" value={form.sort} onChange={set('sort')} /></Field>
            </div>
            <Field label="Text" hint="Separate paragraphs with a blank line.">
              <TextArea value={form.body} onChange={set('body')} className="min-h-[120px]" />
            </Field>
            <Field label="Image (optional)" hint="Shown beside the text. Leave empty to keep the current one.">
              <div className="flex items-center gap-4">
                {(imageFile || form.imageUrl) && (
                  <img
                    src={imageFile ? URL.createObjectURL(imageFile) : form.imageUrl}
                    alt="preview"
                    className="h-16 w-24 rounded object-cover ring-1 ring-black/5"
                  />
                )}
                <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="text-sm" />
                {form.imageUrl && !imageFile && (
                  <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={() => setForm((f) => ({ ...f, imageUrl: '' }))}>
                    Remove image
                  </Button>
                )}
              </div>
            </Field>
            <Toggle
              checked={form.visible}
              onChange={(v) => setForm((f) => ({ ...f, visible: v }))}
              label={form.visible ? 'Visible on the site' : 'Hidden'}
              description="Turn off to hide this section without deleting it."
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
          <p className="text-sm text-as-charcoal/50">No custom sections yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {r.imageUrl && <img src={r.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded object-cover ring-1 ring-black/5" />}
                  <div className="min-w-0">
                    <p className="font-semibold text-as-charcoal">{r.heading || 'Untitled section'}</p>
                    <p className="truncate text-sm text-as-charcoal/55">
                      {r.visible === false ? 'hidden' : 'visible'} · {r.theme === 'dark' ? 'dark' : 'light'} background
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
