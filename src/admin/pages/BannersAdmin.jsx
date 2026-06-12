import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, TextInput, Toggle, Button, Banner } from '../ui.jsx'

const blank = { title: '', subtitle: '', imageUrl: '', linkUrl: '', sort: 0, active: true }

export default function BannersAdmin() {
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [imageFile, setImageFile] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    try {
      setItems(await adminApi.listBanners())
    } catch {
      setMsg({ kind: 'error', text: 'Could not load banners.' })
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
      title: r.title || '', subtitle: r.subtitle || '', imageUrl: r.imageUrl || '',
      linkUrl: r.linkUrl || '', sort: r.sort || 0, active: r.active !== false,
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
      if (!imageUrl) throw new Error('A banner image is required')
      const payload = { ...form, imageUrl, sort: Number(form.sort) }
      if (editing === 'new') await adminApi.createBanner(payload)
      else await adminApi.updateBanner(editing, payload)
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
    if (!confirm(`Delete banner “${r.title || 'untitled'}”?`)) return
    await adminApi.deleteBanner(r.id)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-as-charcoal">Banners</h1>
        {!editing && <Button onClick={startNew}>+ New banner</Button>}
      </div>

      <Banner kind="info">
        Banners appear as a slideshow at the top of the homepage. Clicking a banner (or its
        “Buy tickets” button) opens the link you set here.
      </Banner>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {editing && (
        <Card title={editing === 'new' ? 'New banner' : 'Edit banner'}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" hint="Shown under the banner (e.g. the event name).">
                <TextInput value={form.title} onChange={set('title')} />
              </Field>
              <Field label="Subtitle" hint="E.g. “Friday 12 Jun 2026 · Château Rweiss”.">
                <TextInput value={form.subtitle} onChange={set('subtitle')} />
              </Field>
              <Field label="Link (URL)" hint="Opened when visitors click the banner or “Buy tickets”.">
                <TextInput value={form.linkUrl} onChange={set('linkUrl')} placeholder="https://www.ticketingboxoffice.com/event/..." />
              </Field>
              <Field label="Sort order"><TextInput type="number" value={form.sort} onChange={set('sort')} /></Field>
            </div>
            <Field label="Image" hint="Wide image recommended (e.g. 1920×800). Leave empty to keep the current one.">
              <div className="flex items-center gap-4">
                {(imageFile || form.imageUrl) && (
                  <img
                    src={imageFile ? URL.createObjectURL(imageFile) : form.imageUrl}
                    alt="preview"
                    className="h-16 w-32 rounded object-cover ring-1 ring-black/5"
                  />
                )}
                <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="text-sm" />
              </div>
            </Field>
            <Toggle
              checked={form.active}
              onChange={(v) => setForm((f) => ({ ...f, active: v }))}
              label={form.active ? 'Visible on the site' : 'Hidden'}
              description="Turn off to remove this banner from the slideshow without deleting it."
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
          <p className="text-sm text-as-charcoal/50">No banners yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {r.imageUrl && <img src={r.imageUrl} alt="" className="h-12 w-24 shrink-0 rounded object-cover ring-1 ring-black/5" />}
                  <div className="min-w-0">
                    <p className="font-semibold text-as-charcoal">{r.title || 'Untitled banner'}</p>
                    <p className="truncate text-sm text-as-charcoal/55">
                      {r.active === false ? 'hidden' : 'visible'}{r.linkUrl ? ` · ${r.linkUrl}` : ''}
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
