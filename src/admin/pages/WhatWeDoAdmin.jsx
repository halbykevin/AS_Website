import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, TextInput, TextArea, Select, Toggle, Button, Banner, PageHeader } from '../ui.jsx'

// Icons available for solution cards (see src/components/Icon.jsx).
const ICONS = ['network', 'server', 'shield', 'home', 'pen', 'support', 'signal', 'chip', 'ticket', 'store']

const blankPage = {
  enabled: true, eyebrow: '', title: '', intro: '',
  solutionsHeading: '', solutionsIntro: '',
  visionHeading: '', vision: '', missionHeading: '', mission: '',
  divisionsHeading: '', divisionsIntro: '',
}
const blankSolution = {
  slug: '', title: '', summary: '', icon: 'network', imageUrl: '',
  intro: '', outro: '', sort: 0, visible: true,
}

export default function WhatWeDoAdmin() {
  // ---- Page copy (the singleton what_we_do row) ----
  const [page, setPage] = useState(blankPage)
  const [divisions, setDivisions] = useState([])
  const [savingPage, setSavingPage] = useState(false)

  // ---- Solutions ----
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null) // 'new' | id | null
  const [form, setForm] = useState(blankSolution)
  const [solItems, setSolItems] = useState([]) // [{title, description}]
  const [imageFile, setImageFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const [msg, setMsg] = useState(null)

  const setP = (key) => (e) => setPage((p) => ({ ...p, [key]: e.target.value }))
  const setF = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    try {
      const [p, list] = await Promise.all([adminApi.getWhatWeDo(), adminApi.listSolutions()])
      if (p) {
        setPage({
          enabled: p.enabled !== false,
          eyebrow: p.eyebrow || '', title: p.title || '',
          intro: Array.isArray(p.intro) ? p.intro.join('\n\n') : '',
          solutionsHeading: p.solutionsHeading || '', solutionsIntro: p.solutionsIntro || '',
          visionHeading: p.visionHeading || '', vision: p.vision || '',
          missionHeading: p.missionHeading || '', mission: p.mission || '',
          divisionsHeading: p.divisionsHeading || '', divisionsIntro: p.divisionsIntro || '',
        })
        setDivisions(Array.isArray(p.divisions) ? p.divisions : [])
      }
      setItems(Array.isArray(list) ? list : [])
    } catch {
      setMsg({ kind: 'error', text: 'Could not load What We Do. Is the API running and migrated?' })
    }
  }
  useEffect(() => {
    load()
  }, [])

  // ---- Divisions editor helpers ----
  const updateDivision = (i, key, value) =>
    setDivisions((d) => d.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)))
  const addDivision = () => setDivisions((d) => [...d, { name: '', description: '' }])
  const removeDivision = (i) => setDivisions((d) => d.filter((_, idx) => idx !== i))

  async function savePage(e) {
    e.preventDefault()
    setSavingPage(true)
    setMsg(null)
    try {
      const payload = {
        ...page,
        intro: page.intro.split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean),
        divisions: divisions.filter((d) => d.name || d.description),
      }
      await adminApi.saveWhatWeDo(payload)
      setMsg({ kind: 'success', text: 'Page copy saved.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    } finally {
      setSavingPage(false)
    }
  }

  // ---- Solution items editor helpers ----
  const updateItem = (i, key, value) =>
    setSolItems((s) => s.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)))
  const addItem = () => setSolItems((s) => [...s, { title: '', description: '' }])
  const removeItem = (i) => setSolItems((s) => s.filter((_, idx) => idx !== i))
  const moveItem = (i, dir) =>
    setSolItems((s) => {
      const j = i + dir
      if (j < 0 || j >= s.length) return s
      const copy = [...s]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  const startNew = () => {
    setForm({ ...blankSolution, sort: items.length })
    setSolItems([])
    setImageFile(null)
    setEditing('new')
  }
  const startEdit = (r) => {
    setForm({
      slug: r.slug || '', title: r.title || '', summary: r.summary || '',
      icon: r.icon || 'network', imageUrl: r.imageUrl || '',
      intro: r.intro || '', outro: r.outro || '',
      sort: r.sort || 0, visible: r.visible !== false,
    })
    setSolItems(Array.isArray(r.items) ? r.items.map((it) => ({ title: it.title || '', description: it.description || '' })) : [])
    setImageFile(null)
    setEditing(r.id)
  }
  const cancel = () => setEditing(null)

  async function saveSolution(e) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      let imageUrl = form.imageUrl
      if (imageFile) {
        const up = await adminApi.upload(imageFile)
        imageUrl = up.url
      }
      const payload = {
        ...form,
        imageUrl,
        sort: Number(form.sort),
        items: solItems.filter((it) => it.title || it.description),
      }
      if (editing === 'new') await adminApi.createSolution(payload)
      else await adminApi.updateSolution(editing, payload)
      setEditing(null)
      await load()
      setMsg({ kind: 'success', text: 'Solution saved.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    } finally {
      setSaving(false)
    }
  }

  async function remove(r) {
    if (!confirm(`Delete solution “${r.title}”?`)) return
    await adminApi.deleteSolution(r.id)
    await load()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="What We Do" description="The Absolute Solution page at /what-we-do — page copy and the solutions it lists." />

      <Banner kind="info">
        Each solution becomes a card in the homepage “What We Do” section and a detail page at
        <span className="font-semibold"> /what-we-do/&lt;slug&gt;</span>. Items with a description
        render as rich cards; items without one render as a compact checklist.
      </Banner>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {/* ---- Page copy ---- */}
      <Card title="Page copy">
        <form onSubmit={savePage} className="space-y-4">
          <Toggle
            checked={page.enabled}
            onChange={(v) => setPage((p) => ({ ...p, enabled: v }))}
            label={page.enabled ? 'Page is enabled' : 'Page disabled'}
            description="Informational flag for the page; solutions still appear on the homepage."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Eyebrow"><TextInput value={page.eyebrow} onChange={setP('eyebrow')} placeholder="Absolute Solution" /></Field>
            <Field label="Title"><TextInput value={page.title} onChange={setP('title')} placeholder="Absolute Solution" /></Field>
          </div>
          <Field label="Intro (About Us)" hint="Separate paragraphs with a blank line.">
            <TextArea value={page.intro} onChange={setP('intro')} className="min-h-[140px]" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Solutions heading"><TextInput value={page.solutionsHeading} onChange={setP('solutionsHeading')} placeholder="Our Solutions" /></Field>
            <Field label="Solutions intro"><TextArea value={page.solutionsIntro} onChange={setP('solutionsIntro')} /></Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vision heading"><TextInput value={page.visionHeading} onChange={setP('visionHeading')} placeholder="Our Vision" /></Field>
            <Field label="Mission heading"><TextInput value={page.missionHeading} onChange={setP('missionHeading')} placeholder="Our Mission" /></Field>
            <Field label="Vision"><TextArea value={page.vision} onChange={setP('vision')} /></Field>
            <Field label="Mission"><TextArea value={page.mission} onChange={setP('mission')} /></Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Divisions heading"><TextInput value={page.divisionsHeading} onChange={setP('divisionsHeading')} placeholder="Our Divisions" /></Field>
            <Field label="Divisions intro"><TextInput value={page.divisionsIntro} onChange={setP('divisionsIntro')} placeholder="AS SAL now operates through:" /></Field>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-as-charcoal">Divisions</span>
              <Button type="button" variant="ghost" onClick={addDivision} className="px-3 py-1.5">+ Add division</Button>
            </div>
            <div className="space-y-2">
              {divisions.map((row, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                  <TextInput placeholder="Name (e.g. AS Store)" value={row.name} onChange={(e) => updateDivision(i, 'name', e.target.value)} />
                  <TextInput placeholder="Description" value={row.description} onChange={(e) => updateDivision(i, 'description', e.target.value)} />
                  <Button type="button" variant="danger" onClick={() => removeDivision(i)} className="px-3 py-1.5">Remove</Button>
                </div>
              ))}
              {divisions.length === 0 && <p className="text-xs text-as-charcoal/45">No divisions yet.</p>}
            </div>
          </div>

          <Button type="submit" disabled={savingPage}>{savingPage ? 'Saving…' : 'Save page copy'}</Button>
        </form>
      </Card>

      {/* ---- Solutions ---- */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-as-charcoal">Solutions ({items.length})</h2>
        {!editing && <Button onClick={startNew}>+ New solution</Button>}
      </div>

      {editing && (
        <Card title={editing === 'new' ? 'New solution' : 'Edit solution'}>
          <form onSubmit={saveSolution} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title"><TextInput value={form.title} onChange={setF('title')} required /></Field>
              <Field label="Slug" hint="URL part (/what-we-do/slug). Leave blank to auto-generate from the title.">
                <TextInput value={form.slug} onChange={setF('slug')} placeholder="network-solutions" />
              </Field>
            </div>
            <Field label="Summary" hint="Short line shown on the card.">
              <TextArea value={form.summary} onChange={setF('summary')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Icon">
                <Select value={form.icon} onChange={setF('icon')}>
                  {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
                </Select>
              </Field>
              <Field label="Sort order"><TextInput type="number" value={form.sort} onChange={setF('sort')} /></Field>
            </div>
            <Field label="Intro" hint="Lead paragraph on the detail page.">
              <TextArea value={form.intro} onChange={setF('intro')} />
            </Field>
            <Field label="Closing note (optional)" hint="Highlighted paragraph after the items.">
              <TextArea value={form.outro} onChange={setF('outro')} />
            </Field>

            <Field label="Image (optional)" hint="A banner shown under the detail-page hero.">
              <div className="flex items-center gap-4">
                {(imageFile || form.imageUrl) && (
                  <img
                    src={imageFile ? URL.createObjectURL(imageFile) : form.imageUrl}
                    alt="preview"
                    className="h-20 w-32 rounded object-cover ring-1 ring-black/5"
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

            {/* Items */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-as-charcoal">Items / services</span>
                <Button type="button" variant="ghost" onClick={addItem} className="px-3 py-1.5">+ Add item</Button>
              </div>
              <div className="space-y-3">
                {solItems.map((row, i) => (
                  <div key={i} className="rounded-xl border border-black/10 bg-as-charcoal/[0.02] p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <TextInput placeholder="Title (e.g. Network Security)" value={row.title} onChange={(e) => updateItem(i, 'title', e.target.value)} />
                        <TextInput placeholder="Description (optional)" value={row.description} onChange={(e) => updateItem(i, 'description', e.target.value)} />
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button type="button" variant="ghost" onClick={() => moveItem(i, -1)} className="px-2 py-1" aria-label="Move up">↑</Button>
                        <Button type="button" variant="ghost" onClick={() => moveItem(i, 1)} className="px-2 py-1" aria-label="Move down">↓</Button>
                        <Button type="button" variant="danger" onClick={() => removeItem(i)} className="px-2 py-1">✕</Button>
                      </div>
                    </div>
                  </div>
                ))}
                {solItems.length === 0 && <p className="text-xs text-as-charcoal/45">No items yet.</p>}
              </div>
            </div>

            <Toggle
              checked={form.visible}
              onChange={(v) => setForm((f) => ({ ...f, visible: v }))}
              label={form.visible ? 'Visible' : 'Hidden'}
              description="Turn off to keep the solution but hide it from the site."
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
          <p className="text-sm text-as-charcoal/50">No solutions yet. Add some to fill the What We Do page.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-as-charcoal">
                    {r.title}
                    {r.visible === false && <span className="ml-2 text-xs font-normal text-as-charcoal/45">(hidden)</span>}
                  </p>
                  <p className="truncate text-sm text-as-charcoal/55">
                    /{r.slug} · {Array.isArray(r.items) ? r.items.length : 0} item{(r.items?.length || 0) === 1 ? '' : 's'}
                  </p>
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
