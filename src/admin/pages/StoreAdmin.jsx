import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, TextInput, TextArea, Toggle, Button, Banner } from '../ui.jsx'

const blankProduct = { name: '', imageUrl: '', linkUrl: '', sort: 0, visible: true }
const blankShowcase = { enabled: true, eyebrow: '', heading: '', subheading: '', visibleCount: 8 }

export default function StoreAdmin() {
  // ---- Section settings (the singleton showcase row) ----
  const [showcase, setShowcase] = useState(blankShowcase)
  const [savingShowcase, setSavingShowcase] = useState(false)

  // ---- Products ----
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null) // 'new' | id | null
  const [form, setForm] = useState(blankProduct)
  const [imageFile, setImageFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const [msg, setMsg] = useState(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    try {
      const [s, products] = await Promise.all([
        adminApi.getStoreShowcase(),
        adminApi.listStoreProducts(),
      ])
      if (s) setShowcase({
        enabled: s.enabled !== false,
        eyebrow: s.eyebrow || '', heading: s.heading || '', subheading: s.subheading || '',
        visibleCount: Number(s.visibleCount) || 8,
      })
      setItems(Array.isArray(products) ? products : [])
    } catch {
      setMsg({ kind: 'error', text: 'Could not load the AS Store showcase. Is the API running?' })
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function saveShowcase(e) {
    e.preventDefault()
    setSavingShowcase(true)
    setMsg(null)
    try {
      await adminApi.saveStoreShowcase({ ...showcase, visibleCount: Number(showcase.visibleCount) || 8 })
      setMsg({ kind: 'success', text: 'Section settings saved.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    } finally {
      setSavingShowcase(false)
    }
  }

  const startNew = () => {
    setForm({ ...blankProduct, sort: items.length })
    setImageFile(null)
    setEditing('new')
  }
  const startEdit = (r) => {
    setForm({
      name: r.name || '', imageUrl: r.imageUrl || '', linkUrl: r.linkUrl || '',
      sort: r.sort || 0, visible: r.visible !== false,
    })
    setImageFile(null)
    setEditing(r.id)
  }
  const cancel = () => setEditing(null)

  async function saveProduct(e) {
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
      if (editing === 'new') await adminApi.createStoreProduct(payload)
      else await adminApi.updateStoreProduct(editing, payload)
      setEditing(null)
      await load()
      setMsg({ kind: 'success', text: 'Product saved.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    } finally {
      setSaving(false)
    }
  }

  async function remove(r) {
    if (!confirm(`Delete “${r.name || 'untitled'}” from the showcase?`)) return
    await adminApi.deleteStoreProduct(r.id)
    await load()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-as-charcoal">AS Store Showcase</h1>

      <Banner kind="info">
        The product strip at the very top of the homepage. Edit the section heading below, then add
        the products you want to feature — visitors see them shuffled, and each card opens the AS
        Store (or its “coming soon” page until the store URL is set in Site Settings).
      </Banner>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {/* ---- Section settings ---- */}
      <Card title="Section">
        <form onSubmit={saveShowcase} className="space-y-4">
          <Toggle
            checked={showcase.enabled}
            onChange={(v) => setShowcase((s) => ({ ...s, enabled: v }))}
            label={showcase.enabled ? 'Showcase is visible on the homepage' : 'Showcase hidden'}
            description="Turn off to hide the whole section without deleting products."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Eyebrow" hint="Small label above the heading.">
              <TextInput value={showcase.eyebrow} onChange={(e) => setShowcase((s) => ({ ...s, eyebrow: e.target.value }))} />
            </Field>
            <Field label="Heading">
              <TextInput value={showcase.heading} onChange={(e) => setShowcase((s) => ({ ...s, heading: e.target.value }))} />
            </Field>
          </div>
          <Field label="Subheading">
            <TextArea value={showcase.subheading} onChange={(e) => setShowcase((s) => ({ ...s, subheading: e.target.value }))} />
          </Field>
          <Field label="Products shown" hint="How many of the products below to display (shuffled) at a time.">
            <TextInput
              type="number"
              min="1"
              value={showcase.visibleCount}
              onChange={(e) => setShowcase((s) => ({ ...s, visibleCount: e.target.value }))}
              className="max-w-[140px]"
            />
          </Field>
          <Button type="submit" disabled={savingShowcase}>{savingShowcase ? 'Saving…' : 'Save section'}</Button>
        </form>
      </Card>

      {/* ---- Products ---- */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-as-charcoal">Products ({items.length})</h2>
        {!editing && <Button onClick={startNew}>+ New product</Button>}
      </div>

      {editing && (
        <Card title={editing === 'new' ? 'New product' : 'Edit product'}>
          <form onSubmit={saveProduct} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><TextInput value={form.name} onChange={set('name')} required /></Field>
              <Field label="Sort order"><TextInput type="number" value={form.sort} onChange={set('sort')} /></Field>
            </div>
            <Field label="Link (optional)" hint="Where the card goes. Leave empty to use the AS Store / “coming soon” page.">
              <TextInput value={form.linkUrl} onChange={set('linkUrl')} placeholder="https://store.yourdomain.com/product" />
            </Field>
            <Field label="Image" hint="Square images look best. Leave empty to show a branded tile with the name.">
              <div className="flex items-center gap-4">
                {(imageFile || form.imageUrl) && (
                  <img
                    src={imageFile ? URL.createObjectURL(imageFile) : form.imageUrl}
                    alt="preview"
                    className="h-20 w-20 rounded object-cover ring-1 ring-black/5"
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
              label={form.visible ? 'Visible' : 'Hidden'}
              description="Turn off to keep the product but hide it from the strip."
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
          <p className="text-sm text-as-charcoal/50">No products yet. Add some to fill the showcase.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {r.imageUrl ? (
                    <img src={r.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover ring-1 ring-black/5" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-as-charcoal/5 text-[10px] font-bold uppercase text-as-charcoal/50">
                      No image
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-as-charcoal">{r.name || 'Untitled product'}</p>
                    <p className="text-sm text-as-charcoal/55">
                      {r.visible === false ? 'hidden' : 'visible'}
                      {r.linkUrl ? ' · custom link' : ''}
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
