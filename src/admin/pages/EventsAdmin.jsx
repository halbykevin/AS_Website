import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, TextInput, TextArea, Select, Button, Banner } from '../ui.jsx'

const STATUS = ['open', 'sold-out', 'coming-soon']
const blank = {
  title: '', slug: '', category: '', date: '', time: '', venue: '', city: '',
  imageUrl: '', price: '', status: 'open', excerpt: '', description: '', sort: 0,
}

export default function EventsAdmin() {
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [imageFile, setImageFile] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    try {
      setItems(await adminApi.listEvents())
    } catch {
      setMsg({ kind: 'error', text: 'Could not load events.' })
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
      title: r.title || '', slug: r.slug || '', category: r.category || '',
      date: r.date || '', time: r.time || '', venue: r.venue || '', city: r.city || '',
      imageUrl: r.imageUrl || '', price: r.price || '', status: r.status || 'open',
      excerpt: r.excerpt || '', description: r.description || '', sort: r.sort || 0,
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
      if (editing === 'new') await adminApi.createEvent(payload)
      else await adminApi.updateEvent(editing, payload)
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
    if (!confirm(`Delete event “${r.title}”? This also removes its reservations.`)) return
    await adminApi.deleteEvent(r.id)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-as-charcoal">Events</h1>
        {!editing && <Button onClick={startNew}>+ New event</Button>}
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {editing && (
        <Card title={editing === 'new' ? 'New event' : 'Edit event'}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title"><TextInput value={form.title} onChange={set('title')} required /></Field>
              <Field label="Slug (URL)" hint="Auto-generated from title if left empty.">
                <TextInput value={form.slug} onChange={set('slug')} placeholder="summer-tech-expo-2026" />
              </Field>
              <Field label="Category"><TextInput value={form.category} onChange={set('category')} /></Field>
              <Field label="Price"><TextInput value={form.price} onChange={set('price')} placeholder="Free entry / From $25" /></Field>
              <Field label="Date"><TextInput type="date" value={form.date} onChange={set('date')} /></Field>
              <Field label="Time"><TextInput value={form.time} onChange={set('time')} placeholder="20:30" /></Field>
              <Field label="Venue"><TextInput value={form.venue} onChange={set('venue')} /></Field>
              <Field label="City"><TextInput value={form.city} onChange={set('city')} /></Field>
              <Field label="Status">
                <Select value={form.status} onChange={set('status')}>
                  {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Sort order"><TextInput type="number" value={form.sort} onChange={set('sort')} /></Field>
            </div>
            <Field label="Image" hint="Leave empty to keep the current image.">
              <div className="flex items-center gap-4">
                {(imageFile || form.imageUrl) && (
                  <img
                    src={imageFile ? URL.createObjectURL(imageFile) : form.imageUrl}
                    alt="preview"
                    className="h-16 w-24 rounded object-cover ring-1 ring-black/5"
                  />
                )}
                <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="text-sm" />
              </div>
            </Field>
            <Field label="Excerpt" hint="Short one-line summary shown on cards.">
              <TextInput value={form.excerpt} onChange={set('excerpt')} />
            </Field>
            <Field label="Description"><TextArea value={form.description} onChange={set('description')} className="min-h-[120px]" /></Field>
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button type="button" variant="ghost" onClick={cancel}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {items.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">No events yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {r.imageUrl && <img src={r.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded object-cover ring-1 ring-black/5" />}
                  <div className="min-w-0">
                    <p className="font-semibold text-as-charcoal">{r.title}</p>
                    <p className="truncate text-sm text-as-charcoal/55">
                      {(r.date || 'no date')} · {r.venue} · {r.status}
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
