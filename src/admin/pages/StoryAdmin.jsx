import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, TextInput, TextArea, Toggle, Button, Banner, PageHeader, SegmentedControl } from '../ui.jsx'

const SIZES = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
]
const GRADIENTS = [
  { value: 'solid', label: 'Solid' },
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
]
const blankPanel = {
  heading: '', caption: '', imageUrl: '', accent: '', accent2: '', gradientType: 'solid',
  linkUrl: '', size: 'md', sort: 0, visible: true,
}
const blankStory = { enabled: true, eyebrow: '', heading: '', subheading: '' }

export default function StoryAdmin() {
  // ---- Section settings (the singleton story row) ----
  const [story, setStory] = useState(blankStory)
  const [savingStory, setSavingStory] = useState(false)

  // ---- Panels ----
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null) // 'new' | id | null
  const [form, setForm] = useState(blankPanel)
  const [imageFile, setImageFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const [msg, setMsg] = useState(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    try {
      const [s, panels] = await Promise.all([adminApi.getStory(), adminApi.listStoryPanels()])
      if (s)
        setStory({
          enabled: s.enabled !== false,
          eyebrow: s.eyebrow || '',
          heading: s.heading || '',
          subheading: s.subheading || '',
        })
      setItems(Array.isArray(panels) ? panels : [])
    } catch {
      setMsg({ kind: 'error', text: 'Could not load the story section. Is the API running and migrated?' })
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function saveStory(e) {
    e.preventDefault()
    setSavingStory(true)
    setMsg(null)
    try {
      await adminApi.saveStory(story)
      setMsg({ kind: 'success', text: 'Section settings saved.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    } finally {
      setSavingStory(false)
    }
  }

  const startNew = () => {
    setForm({ ...blankPanel, sort: items.length })
    setImageFile(null)
    setEditing('new')
  }
  const startEdit = (r) => {
    setForm({
      heading: r.heading || '',
      caption: r.caption || '',
      imageUrl: r.imageUrl || '',
      accent: r.accent || '',
      accent2: r.accent2 || '',
      gradientType: r.gradientType || 'solid',
      linkUrl: r.linkUrl || '',
      size: r.size || 'md',
      sort: r.sort || 0,
      visible: r.visible !== false,
    })
    setImageFile(null)
    setEditing(r.id)
  }
  const cancel = () => setEditing(null)

  async function savePanel(e) {
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
      if (editing === 'new') await adminApi.createStoryPanel(payload)
      else await adminApi.updateStoryPanel(editing, payload)
      setEditing(null)
      await load()
      setMsg({ kind: 'success', text: 'Panel saved.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    } finally {
      setSaving(false)
    }
  }

  async function remove(r) {
    if (!confirm(`Delete panel “${r.heading || 'untitled'}”?`)) return
    await adminApi.deleteStoryPanel(r.id)
    await load()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Scroll Story" />

      <Banner kind="info">
        The self-playing showcase strip at the very top of the homepage. Each panel is a heading +
        image; they auto-advance on a timer (a swipeable carousel for reduced-motion visitors). The
        strip is a fixed height that matches the events banner below it, so keep headings short and
        images simple. The whole section stays hidden until it’s enabled and has at least one visible
        panel.
      </Banner>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {/* ---- Section settings ---- */}
      <Card title="Section">
        <form onSubmit={saveStory} className="space-y-4">
          <Toggle
            checked={story.enabled}
            onChange={(v) => setStory((s) => ({ ...s, enabled: v }))}
            label={story.enabled ? 'Story is visible on the homepage' : 'Story hidden'}
            description="Turn off to hide the whole section without deleting panels."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Eyebrow" hint="Small label pinned in the corner (tablet & desktop only).">
              <TextInput value={story.eyebrow} onChange={(e) => setStory((s) => ({ ...s, eyebrow: e.target.value }))} />
            </Field>
            <Field label="Heading" hint="Section title pinned in the corner (tablet & desktop only).">
              <TextInput value={story.heading} onChange={(e) => setStory((s) => ({ ...s, heading: e.target.value }))} />
            </Field>
          </div>
          <Field label="Subheading" hint="Shown above the carousel on mobile.">
            <TextArea value={story.subheading} onChange={(e) => setStory((s) => ({ ...s, subheading: e.target.value }))} />
          </Field>
          <Button type="submit" disabled={savingStory}>{savingStory ? 'Saving…' : 'Save section'}</Button>
        </form>
      </Card>

      {/* ---- Panels ---- */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-as-charcoal">Panels ({items.length})</h2>
        {!editing && <Button onClick={startNew}>+ New panel</Button>}
      </div>

      {editing && (
        <Card title={editing === 'new' ? 'New panel' : 'Edit panel'}>
          <form onSubmit={savePanel} className="space-y-4">
            <Field label="Heading" hint="The big headline shown on the panel.">
              <TextInput value={form.heading} onChange={set('heading')} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Caption" hint="Small label above the heading (optional).">
                <TextInput value={form.caption} onChange={set('caption')} />
              </Field>
              <Field label="Sort order"><TextInput type="number" value={form.sort} onChange={set('sort')} /></Field>
            </div>
            <Field label="Colour style" hint="Solid, or a 2-colour gradient applied to the heading + glow.">
              <SegmentedControl
                value={form.gradientType}
                onChange={(v) => setForm((f) => ({ ...f, gradientType: v }))}
                options={GRADIENTS}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={form.gradientType === 'solid' ? 'Colour' : 'Colour 1 (gradient start)'} hint="Also the caption + glow colour.">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.accent || '#A41E22'}
                    onChange={set('accent')}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded border border-black/10 bg-white"
                    aria-label="Colour 1"
                  />
                  <TextInput value={form.accent} onChange={set('accent')} placeholder="#A41E22" />
                </div>
              </Field>
              {form.gradientType !== 'solid' && (
                <Field label="Colour 2 (gradient end)">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.accent2 || '#C53A3F'}
                      onChange={set('accent2')}
                      className="h-10 w-12 shrink-0 cursor-pointer rounded border border-black/10 bg-white"
                      aria-label="Colour 2"
                    />
                    <TextInput value={form.accent2} onChange={set('accent2')} placeholder="#C53A3F" />
                  </div>
                </Field>
              )}
            </div>
            <Field label="Link (optional)" hint="Where the panel’s image/button goes. Path (/events) or full URL.">
              <TextInput value={form.linkUrl} onChange={set('linkUrl')} placeholder="/events or https://…" />
            </Field>
            <Field label="Image size" hint="Controls how big this panel's image is — mix sizes for variety. Scales on mobile too.">
              <SegmentedControl
                value={form.size}
                onChange={(v) => setForm((f) => ({ ...f, size: v }))}
                options={SIZES}
              />
            </Field>
            <Field label="Image" hint="Portrait images look best on desktop. Leave empty for a branded tile.">
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
              description="Turn off to keep the panel but hide it from the story."
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
          <p className="text-sm text-as-charcoal/50">No panels yet. Add some to build the story.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {r.imageUrl ? (
                    <img src={r.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover ring-1 ring-black/5" />
                  ) : (
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded text-[10px] font-bold uppercase text-white/70"
                      style={{ background: r.accent || '#A41E22' }}
                    >
                      Tile
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-as-charcoal">{r.heading || 'Untitled panel'}</p>
                    <p className="truncate text-sm text-as-charcoal/55">
                      {r.visible === false ? 'hidden' : 'visible'}
                      {r.caption ? ` · ${r.caption}` : ''}
                      {r.linkUrl ? ' · linked' : ''}
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
