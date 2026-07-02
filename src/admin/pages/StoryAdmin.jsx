import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, Toggle, Button, Banner, PageHeader } from '../ui.jsx'

const blankStory = { enabled: true, eyebrow: '', heading: '', subheading: '' }

export default function StoryAdmin() {
  // ---- Section settings (the singleton story row) ----
  const [story, setStory] = useState(blankStory)
  const [savingStory, setSavingStory] = useState(false)

  // ---- Slides (image panels) ----
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  const [msg, setMsg] = useState(null)

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
      setMsg({ kind: 'error', text: 'Could not load the store slideshow. Is the API running and migrated?' })
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

  // ---- Add a new image slide (upload → create panel) ----
  async function addImage(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be picked again later
    if (!file) return
    setSaving(true)
    setMsg(null)
    try {
      const up = await adminApi.upload(file)
      await adminApi.createStoryPanel({ imageUrl: up.url, sort: items.length, visible: true })
      await load()
      setMsg({ kind: 'success', text: 'Image added.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Upload failed: ' + (err?.message || 'error') })
    } finally {
      setSaving(false)
    }
  }

  async function toggleVisible(r) {
    try {
      await adminApi.updateStoryPanel(r.id, { imageUrl: r.imageUrl, sort: r.sort, visible: !(r.visible !== false) })
      await load()
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    }
  }

  // ---- Reorder the slideshow ----
  async function move(index, dir) {
    const j = index + dir
    if (j < 0 || j >= items.length) return
    const arr = [...items]
    ;[arr[index], arr[j]] = [arr[j], arr[index]]
    setItems(arr) // optimistic
    try {
      await Promise.all(
        arr.map((r, i) => adminApi.updateStoryPanel(r.id, { imageUrl: r.imageUrl, sort: i, visible: r.visible !== false }))
      )
    } catch {
      setMsg({ kind: 'error', text: 'Could not save the new order.' })
      load()
    }
  }

  async function remove(r) {
    if (!confirm('Delete this image?')) return
    await adminApi.deleteStoryPanel(r.id)
    await load()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Store Slideshow" />

      <Banner kind="info">
        The image slideshow at the very top of the homepage. Upload wide images (e.g. 1920×800) — they
        auto-advance and are cropped to a fixed height matching the events banner below. Clicking any
        slide opens the <strong>AS Store “coming soon”</strong> page. The section stays hidden until
        it’s enabled and has at least one visible image.
      </Banner>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {/* ---- Section on/off ---- */}
      <Card title="Section">
        <form onSubmit={saveStory} className="space-y-4">
          <Toggle
            checked={story.enabled}
            onChange={(v) => setStory((s) => ({ ...s, enabled: v }))}
            label={story.enabled ? 'Slideshow is visible on the homepage' : 'Slideshow hidden'}
            description="Turn off to hide the whole section without deleting images."
          />
          <Button type="submit" disabled={savingStory}>{savingStory ? 'Saving…' : 'Save section'}</Button>
        </form>
      </Card>

      {/* ---- Add image ---- */}
      <Card title="Add an image">
        <Field label="Image" hint="Wide image recommended (e.g. 1920×800). Cropped to fill the strip.">
          <input
            type="file"
            accept="image/*"
            onChange={addImage}
            disabled={saving}
            className="text-sm"
          />
        </Field>
        {saving && <p className="mt-2 text-sm text-as-charcoal/55">Uploading…</p>}
      </Card>

      {/* ---- Slides ---- */}
      <Card title={`Slideshow order (${items.length})`}>
        {items.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">No images yet. Add some above to build the slideshow.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((r, i) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="flex h-6 w-6 items-center justify-center rounded text-as-charcoal/60 transition hover:bg-black/5 disabled:opacity-25"
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label="Move down"
                    className="flex h-6 w-6 items-center justify-center rounded text-as-charcoal/60 transition hover:bg-black/5 disabled:opacity-25"
                  >↓</button>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {r.imageUrl
                    ? <img src={r.imageUrl} alt="" className="h-12 w-24 shrink-0 rounded object-cover ring-1 ring-black/5" />
                    : <span className="h-12 w-24 shrink-0 rounded bg-as-gray/20" />}
                  <p className="truncate text-sm text-as-charcoal/55">
                    {r.visible === false ? 'hidden' : 'visible'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" onClick={() => toggleVisible(r)} className="px-3 py-1.5">
                    {r.visible === false ? 'Show' : 'Hide'}
                  </Button>
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
