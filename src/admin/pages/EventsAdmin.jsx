import { useEffect, useState } from 'react'
import { adminApi, isEventPast } from '../../lib/api.js'
import { Card, Field, TextInput, TextArea, Select, Button, Banner, PageHeader, SegmentedControl } from '../ui.jsx'

const STATUS = [
  { value: 'open', label: 'Open' },
  { value: 'sold-out', label: 'Sold out' },
  { value: 'coming-soon', label: 'Coming soon' },
]
const blank = {
  title: '', slug: '', date: '', time: '', venue: '', city: '',
  imageUrl: '', ticketUrl: '', status: 'open', excerpt: '', description: '', sort: 0, categoryId: '',
}

export default function EventsAdmin() {
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [imageFile, setImageFile] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    try {
      const [events, cats] = await Promise.all([adminApi.listEvents(), adminApi.listCategories()])
      setItems(events)
      setCategories(cats)
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
      title: r.title || '', slug: r.slug || '',
      date: r.date || '', time: r.time || '', venue: r.venue || '', city: r.city || '',
      imageUrl: r.imageUrl || '', ticketUrl: r.ticketUrl || '', status: r.status || 'open',
      excerpt: r.excerpt || '', description: r.description || '', sort: r.sort || 0,
      categoryId: r.categoryId ? String(r.categoryId) : '',
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
    if (!confirm(`Delete event “${r.title}”? This cannot be undone.`)) return
    await adminApi.deleteEvent(r.id)
    await load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        actions={!editing && <Button onClick={startNew}>+ New event</Button>}
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {editing && (
        <Card title={editing === 'new' ? 'New event' : 'Edit event'}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title"><TextInput value={form.title} onChange={set('title')} required /></Field>
              <Field label="Slug (URL)" hint="Auto-generated from title if left empty.">
                <TextInput value={form.slug} onChange={set('slug')} placeholder="summer-tech-expo-2026" />
              </Field>
              <Field label="Date"><TextInput type="date" value={form.date} onChange={set('date')} /></Field>
              <Field label="Time"><TextInput value={form.time} onChange={set('time')} placeholder="20:30" /></Field>
              <Field label="Venue"><TextInput value={form.venue} onChange={set('venue')} /></Field>
              <Field label="City"><TextInput value={form.city} onChange={set('city')} /></Field>
              <Field label="Status">
                <SegmentedControl
                  value={form.status}
                  onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  options={STATUS}
                />
              </Field>
              <Field label="Sort order"><TextInput type="number" value={form.sort} onChange={set('sort')} /></Field>
              <Field label="Category" hint="Used for the category tiles & filtering on the site.">
                <Select value={form.categoryId} onChange={set('categoryId')}>
                  <option value="">— None —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label="Ticket link (URL)"
              hint="Included in the WhatsApp reservation message so customers have the original event page. Set the WhatsApp number in Site Settings → Contact."
            >
              <TextInput value={form.ticketUrl} onChange={set('ticketUrl')} placeholder="https://tickit.co/events/..." />
            </Field>
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
            {items.map((r) => {
              const past = isEventPast(r)
              return (
              <li
                key={r.id}
                className={`flex items-center justify-between gap-4 border-l-4 py-3 pl-3 ${past ? 'border-as-red bg-as-red/[0.04]' : 'border-transparent'}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {r.imageUrl && (
                    <img
                      src={r.imageUrl}
                      alt=""
                      className={`h-12 w-16 shrink-0 rounded object-cover ring-1 ring-black/5 ${past ? 'opacity-60 grayscale' : ''}`}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-as-charcoal">
                      <span className="truncate">{r.title}</span>
                      {past && (
                        <span className="shrink-0 rounded-full bg-as-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Past
                        </span>
                      )}
                    </p>
                    <p className={`truncate text-sm ${past ? 'text-as-red/80' : 'text-as-charcoal/55'}`}>
                      {(r.date || 'no date')} · {r.venue} · {r.status}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" onClick={() => startEdit(r)} className="px-3 py-1.5">Edit</Button>
                  <Button variant="danger" onClick={() => remove(r)} className="px-3 py-1.5">Delete</Button>
                </div>
              </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
