import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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

// Events AS Company hosts are made here by hand (source ''); the rest come in
// from the ticketing sites with the events sync. Only a hosted event gets a seat
// map and ticket stock of its own — a synced one's hall is the partner's.
// Where a live event can be looked at. Site Settings → Events → ticketing URL
// when set, the production hub otherwise.
const HUB_URL = 'https://ticketing.as.com.lb'

const VIEWS = [
  { value: 'hosted', label: 'Hosted by AS' },
  { value: 'synced', label: 'Ticketing sites' },
]

export default function EventsAdmin() {
  const [items, setItems] = useState([])
  const [view, setView] = useState('hosted')
  const [maps, setMaps] = useState(new Map())
  const [hubUrl, setHubUrl] = useState(HUB_URL)
  const [categories, setCategories] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [imageFile, setImageFile] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    try {
      const [events, cats, seatmaps, settings] = await Promise.all([
        adminApi.listEvents(),
        adminApi.listCategories(),
        adminApi.listSeatmaps().catch(() => []),
        adminApi.getSettings().catch(() => ({})),
      ])
      if (/^https?:\/\//.test(settings.ticketingUrl || '')) setHubUrl(settings.ticketingUrl.replace(/\/$/, ''))
      setItems(events)
      setCategories(cats)
      setMaps(new Map(seatmaps.map((m) => [m.eventId, m])))
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
      const created = editing === 'new'
      if (created) await adminApi.createEvent(payload)
      else await adminApi.updateEvent(editing, payload)
      setEditing(null)
      await load()
      setMsg({
        kind: 'success',
        text: created
          ? 'Saved as a draft — add its seat map and tickets, then press Publish to put it live.'
          : 'Saved.',
      })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    } finally {
      setSaving(false)
    }
  }

  // A draft is invisible everywhere (hub, as.com.lb, the app); Publish puts it
  // live and the API tells the hub at once, so it is there on the next visit.
  async function publish(r, published) {
    const ask = published
      ? `Publish “${r.title}”? It goes live on the ticketing hub straight away.`
      : `Unpublish “${r.title}”? It disappears from the ticketing hub and the app until you publish it again.`
    if (!confirm(ask)) return
    setMsg(null)
    try {
      const res = await adminApi.publishEvent(r.id, published)
      await load()
      setMsg({
        kind: 'success',
        text: !published
          ? `“${r.title}” is unpublished.`
          : res.hubRefreshed
            ? `“${r.title}” is live.`
            : `“${r.title}” is published — the ticketing hub shows it within 5 minutes.`,
      })
    } catch (err) {
      setMsg({ kind: 'error', text: (published ? 'Publish' : 'Unpublish') + ' failed: ' + (err?.message || 'error') })
    }
  }

  async function remove(r) {
    if (!confirm(`Delete event “${r.title}”? This cannot be undone.`)) return
    await adminApi.deleteEvent(r.id)
    await load()
  }

  const hosted = items.filter((r) => !r.source)
  const shown = view === 'hosted' ? hosted : items.filter((r) => r.source)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="Events AS Company hosts are created here, with their seat map and tickets. The rest come from the ticketing sites (Web Scraper)."
        actions={!editing && <Button onClick={startNew}>+ New AS event</Button>}
      />

      <SegmentedControl
        value={view}
        onChange={setView}
        options={VIEWS.map((v) => ({
          value: v.value,
          label: `${v.label} (${v.value === 'hosted' ? hosted.length : items.length - hosted.length})`,
        }))}
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
        {shown.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">
            {view === 'hosted'
              ? 'No events hosted by AS yet — “+ New AS event” creates one, then add its seat map and tickets.'
              : 'No events from the ticketing sites.'}
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {shown.map((r) => {
              const past = isEventPast(r)
              const map = maps.get(r.id)
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
                      {!r.published && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                          Draft
                        </span>
                      )}
                      {!r.source && r.published && !past && (
                        <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-800">
                          Live
                        </span>
                      )}
                      {past && (
                        <span className="shrink-0 rounded-full bg-as-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Past
                        </span>
                      )}
                    </p>
                    <p className={`truncate text-sm ${past ? 'text-as-red/80' : 'text-as-charcoal/55'}`}>
                      {(r.date || 'no date')} · {r.venue} · {r.status}
                    </p>
                    {!r.source && <SeatmapStatus map={map} />}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {!r.published && (
                    <Button onClick={() => publish(r, true)} className="px-3 py-1.5">Publish</Button>
                  )}
                  {r.published && !r.source && (
                    <a
                      href={`${hubUrl}/events/${r.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-semibold text-as-charcoal shadow-sm transition hover:border-as-red/30 hover:text-as-red"
                    >
                      View ↗
                    </a>
                  )}
                  {!r.source && (
                    <Link
                      to={`/admin/events/${r.id}/seatmap`}
                      className="rounded-full bg-as-charcoal px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-as-charcoal/85"
                    >
                      Seat map & tickets
                    </Link>
                  )}
                  <Button variant="ghost" onClick={() => startEdit(r)} className="px-3 py-1.5">Edit</Button>
                  {r.published && !r.source && (
                    <Button variant="ghost" onClick={() => publish(r, false)} className="px-3 py-1.5">Unpublish</Button>
                  )}
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

/** One line under a hosted event: its tickets, and whether the hub offers seat picking. */
function SeatmapStatus({ map }) {
  if (!map) return <p className="mt-0.5 text-xs text-as-charcoal/40">No seat map yet</p>
  return (
    <p className="mt-0.5 text-xs text-as-charcoal/55">
      {map.available} of {map.total} tickets available · {map.sold} sold
      {map.reserved > 0 && <span className="font-semibold text-amber-700"> · {map.reserved} reserved, awaiting payment</span>}
      {!map.published && <span className="text-amber-700"> · seat picking off</span>}
    </p>
  )
}
