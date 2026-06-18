import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, TextInput, TextArea, Select, Button, Banner, PageHeader } from '../ui.jsx'

const ICONS = ['signal', 'chip', 'ticket', 'support', 'store']
const blank = { title: '', description: '', icon: 'chip', sort: 0 }

export default function ServicesAdmin() {
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null) // record id or 'new'
  const [form, setForm] = useState(blank)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    try {
      setItems(await adminApi.listServices())
    } catch {
      setMsg({ kind: 'error', text: 'Could not load services.' })
    }
  }
  useEffect(() => {
    load()
  }, [])

  const startNew = () => {
    setForm({ ...blank, sort: items.length })
    setEditing('new')
  }
  const startEdit = (r) => {
    setForm({ title: r.title, description: r.description || '', icon: r.icon || 'chip', sort: r.sort || 0 })
    setEditing(r.id)
  }
  const cancel = () => setEditing(null)

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      const payload = { ...form, sort: Number(form.sort) }
      if (editing === 'new') await adminApi.createService(payload)
      else await adminApi.updateService(editing, payload)
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
    if (!confirm(`Delete service “${r.title}”?`)) return
    await adminApi.deleteService(r.id)
    await load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services"
        actions={!editing && <Button onClick={startNew}>+ New service</Button>}
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {editing && (
        <Card title={editing === 'new' ? 'New service' : 'Edit service'}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Title"><TextInput value={form.title} onChange={set('title')} required /></Field>
            <Field label="Description"><TextArea value={form.description} onChange={set('description')} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Icon">
                <Select value={form.icon} onChange={set('icon')}>
                  {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
                </Select>
              </Field>
              <Field label="Sort order"><TextInput type="number" value={form.sort} onChange={set('sort')} /></Field>
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button type="button" variant="ghost" onClick={cancel}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {items.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">No services yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-as-charcoal">{r.title}</p>
                  <p className="truncate text-sm text-as-charcoal/55">{r.description}</p>
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
