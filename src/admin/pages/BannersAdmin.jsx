import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, TextInput, Select, Toggle, Button, Banner, PageHeader } from '../ui.jsx'

const blank = { title: '', subtitle: '', imageUrl: '', linkUrl: '', sort: 0, active: true, eventId: '', focalX: 50, focalY: 50 }

export default function BannersAdmin() {
  const [items, setItems] = useState([])
  const [events, setEvents] = useState([])
  const [picked, setPicked] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [imageFile, setImageFile] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const evMap = new Map(events.map((e) => [e.id, e]))

  async function load() {
    try {
      const [banners, evs] = await Promise.all([adminApi.listBanners(), adminApi.listEvents()])
      setItems(banners)
      setEvents(evs)
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
      eventId: r.eventId ? String(r.eventId) : '',
      focalX: r.focalX ?? 50, focalY: r.focalY ?? 50,
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
      if (!imageUrl && !form.eventId) throw new Error('Add an image, or pick an event to use its image')
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
    if (!confirm(`Delete banner “${r.title || evMap.get(r.eventId)?.title || 'untitled'}”?`)) return
    await adminApi.deleteBanner(r.id)
    await load()
  }

  // ---- Build banners straight from events ----
  const togglePick = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  async function addFromEvents() {
    if (!picked.length) return
    setSaving(true)
    setMsg(null)
    try {
      let sort = items.length
      // Keep the order the admin picked them in.
      for (const id of picked) {
        await adminApi.createBanner({ eventId: Number(id), sort: sort++, active: true })
      }
      const n = picked.length
      setPicked([])
      await load()
      setMsg({ kind: 'success', text: `Added ${n} banner${n === 1 ? '' : 's'} from events.` })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Could not add: ' + (err?.message || 'error') })
    } finally {
      setSaving(false)
    }
  }

  // ---- Reorder the slideshow ----
  const payloadOf = (b, sort) => ({
    title: b.title || '', subtitle: b.subtitle || '', imageUrl: b.imageUrl || '',
    linkUrl: b.linkUrl || '', sort, active: b.active !== false, eventId: b.eventId || '',
    focalX: b.focalX ?? 50, focalY: b.focalY ?? 50,
  })
  async function move(index, dir) {
    const j = index + dir
    if (j < 0 || j >= items.length) return
    const arr = [...items]
    ;[arr[index], arr[j]] = [arr[j], arr[index]]
    setItems(arr) // optimistic
    try {
      await Promise.all(arr.map((b, i) => adminApi.updateBanner(b.id, payloadOf(b, i))))
    } catch {
      setMsg({ kind: 'error', text: 'Could not save the new order.' })
      load()
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banners"
        actions={!editing && <Button onClick={startNew}>+ New banner</Button>}
      />

      <Banner kind="info">
        Banners are the homepage slideshow. Add them straight from your events below (each uses the
        event’s image, title and link), or build one manually. Use the ↑ ↓ arrows to set the order.
      </Banner>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {!editing && events.length > 0 && (
        <Card title="Add banners from events">
          <p className="mb-3 text-sm text-as-charcoal/55">
            Tick the events you want in the slideshow, then add them. They’re populated dynamically
            from each event — reorder them in the list below.
          </p>
          <div className="max-h-64 divide-y divide-black/5 overflow-auto rounded-xl border border-black/10">
            {events.map((ev) => (
              <label key={ev.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-black/[0.02]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-as-red"
                  checked={picked.includes(String(ev.id))}
                  onChange={() => togglePick(String(ev.id))}
                />
                {ev.imageUrl
                  ? <img src={ev.imageUrl} alt="" className="h-8 w-12 shrink-0 rounded object-cover ring-1 ring-black/5" />
                  : <span className="h-8 w-12 shrink-0 rounded bg-as-gray/20" />}
                <span className="min-w-0 flex-1 truncate text-as-charcoal">{ev.title}</span>
                <span className="shrink-0 text-xs text-as-charcoal/45">{ev.date}</span>
              </label>
            ))}
          </div>
          <div className="mt-4">
            <Button onClick={addFromEvents} disabled={!picked.length || saving}>
              {saving ? 'Adding…' : `Add ${picked.length || ''} as banner${picked.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </Card>
      )}

      {editing && (
        <Card title={editing === 'new' ? 'New banner' : 'Edit banner'}>
          <form onSubmit={save} className="space-y-4">
            <Field
              label="Driven by event"
              hint="Optional. The banner borrows this event’s image, title and link. Leave on “None” for a fully manual banner."
            >
              <Select value={form.eventId} onChange={set('eventId')}>
                <option value="">— None (manual banner) —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.title}</option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" hint="Optional override. Defaults to the event’s title.">
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

            {(() => {
              const ev = form.eventId ? evMap.get(Number(form.eventId)) : null
              const focalImg = imageFile ? URL.createObjectURL(imageFile) : (form.imageUrl || ev?.imageUrl || '')
              if (!focalImg) return null
              return (
                <Field
                  label="Position in banner"
                  hint="The homepage banner has a fixed shape and crops the image. Drag to choose what stays visible — preview both desktop and mobile crops."
                >
                  <FocalPicker
                    image={focalImg}
                    focalX={Number(form.focalX) || 50}
                    focalY={Number(form.focalY) || 50}
                    onChange={(x, y) => setForm((f) => ({ ...f, focalX: x, focalY: y }))}
                  />
                </Field>
              )
            })()}

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

      <Card title="Slideshow order">
        {items.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">No banners yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((r, i) => {
              const ev = r.eventId ? evMap.get(r.eventId) : null
              const img = r.imageUrl || ev?.imageUrl || ''
              const title = r.title || ev?.title || 'Untitled banner'
              return (
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
                    {img
                      ? <img src={img} alt="" className="h-12 w-24 shrink-0 rounded object-cover ring-1 ring-black/5" />
                      : <span className="h-12 w-24 shrink-0 rounded bg-as-gray/20" />}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-as-charcoal">{title}</p>
                      <p className="truncate text-sm text-as-charcoal/55">
                        {ev ? 'from event' : 'manual'}{r.active === false ? ' · hidden' : ''}
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

// Drag-to-pan focal-point picker. The frame matches the homepage banner's fixed
// aspect ratio and crops the image (object-cover); dragging moves the image
// inside the frame, which we store as an object-position focal point (%).
const PREVIEW_ASPECTS = {
  desktop: { label: 'Desktop', cls: 'aspect-[16/5]' },
  mobile: { label: 'Mobile', cls: 'aspect-[16/9]' },
}
const clampPct = (v) => Math.min(100, Math.max(0, v))

function FocalPicker({ image, focalX, focalY, onChange }) {
  const [aspect, setAspect] = useState('desktop')
  const frameRef = useRef(null)
  const dragging = useRef(false)
  const start = useRef({ x: 0, y: 0, fx: 50, fy: 50 })

  const onPointerDown = (e) => {
    dragging.current = true
    start.current = { x: e.clientX, y: e.clientY, fx: focalX, fy: focalY }
    frameRef.current?.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!dragging.current || !frameRef.current) return
    const rect = frameRef.current.getBoundingClientRect()
    // Drag the image right → reveal its left side → focal X decreases.
    const dx = ((e.clientX - start.current.x) / rect.width) * 100
    const dy = ((e.clientY - start.current.y) / rect.height) * 100
    onChange(Math.round(clampPct(start.current.fx - dx)), Math.round(clampPct(start.current.fy - dy)))
  }
  const onPointerUp = () => {
    dragging.current = false
  }

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative w-full cursor-grab touch-none select-none overflow-hidden rounded-xl bg-as-charcoal ring-1 ring-black/10 active:cursor-grabbing ${PREVIEW_ASPECTS[aspect].cls}`}
      >
        <img
          src={image}
          alt="Banner crop preview"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: `${focalX}% ${focalY}%` }}
        />
        {/* Focal marker */}
        <span
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow ring-2 ring-black/30"
          style={{ left: `${focalX}%`, top: `${focalY}%` }}
        />
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white">
          Drag to reposition
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg ring-1 ring-black/10">
          {Object.entries(PREVIEW_ASPECTS).map(([key, a]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAspect(key)}
              className={`px-3 py-1.5 text-xs font-semibold transition ${
                aspect === key ? 'bg-as-red text-white' : 'bg-white text-as-charcoal/70 hover:bg-black/5'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={() => onChange(50, 50)}>
          Center
        </Button>
        <span className="text-xs text-as-charcoal/45">Focus {focalX}% · {focalY}%</span>
      </div>
    </div>
  )
}
