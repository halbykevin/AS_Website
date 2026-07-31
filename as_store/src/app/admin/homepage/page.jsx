'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Reorder, useDragControls } from 'framer-motion'
import Icon from '@/components/Icon.jsx'
import { Button, Card, Badge, Spinner, Field, Input, Textarea, Select, Toggle, Modal } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'

const TYPE_LABELS = {
  hero: 'Hero',
  showcase: 'Showcase',
  productRail: 'Product rail',
  bento: 'Bento grid',
  cta: 'Call to action',
  richtext: 'Text block',
}

// What each block type carries, so the editor only shows relevant fields.
const HAS = {
  hero: { eyebrow: true, sub: true, product: true, buttons: true },
  showcase: { eyebrow: true, sub: true, image: true, buttons: true },
  productRail: { sub: true, rail: true },
  bento: { tiles: true },
  cta: { sub: true, buttons: true },
  richtext: { body: true, align: true },
}

function blankSection(type) {
  const s = { type, eyebrow: '', heading: '', subheading: '', body: '', imageUrl: '', bg: '', textTheme: 'auto', visible: true, settings: {} }
  if (HAS[type]?.buttons) s.settings.buttons = []
  if (type === 'productRail') s.settings = { category: 'All', limit: 0, anchor: '' }
  if (type === 'bento') s.settings = { tiles: [] }
  if (type === 'richtext') s.settings = { align: 'center' }
  return s
}

export default function HomepageAdmin() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'sections'], queryFn: adminApi.listSections })
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    if (data) setItems(data)
  }, [data])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'sections'] })
  const orderDirty = data && data.map((s) => s.id).join(',') !== items.map((s) => s.id).join(',')

  const saveOrder = useMutation({
    mutationFn: () => adminApi.reorderSections(items.map((s) => s.id)),
    onSuccess: () => { invalidate(); toast.success('Order saved') },
    onError: (e) => toast.error(e.message),
  })
  const toggleVisible = useMutation({
    mutationFn: ({ id, visible }) => adminApi.updateSection(id, { visible }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: (id) => adminApi.deleteSection(id),
    onSuccess: () => { invalidate(); toast.success('Section deleted') },
    onError: (e) => toast.error(e.message),
  })

  const onToggle = (s) => {
    setItems((arr) => arr.map((i) => (i.id === s.id ? { ...i, visible: !i.visible } : i)))
    toggleVisible.mutate({ id: s.id, visible: !s.visible })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-admin-text/50">Drag to reorder. Toggle to show/hide. Click a block to edit its content & background.</p>
        <div className="flex items-center gap-2">
          {orderDirty && (
            <Button onClick={() => saveOrder.mutate()} disabled={saveOrder.isPending}>
              {saveOrder.isPending ? 'Saving…' : 'Save order'}
            </Button>
          )}
          <AddMenu onPick={(type) => setEditing(blankSection(type))} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : items.length === 0 ? (
        <Card className="py-16 text-center text-sm text-admin-text/50">No sections yet. Add your first block.</Card>
      ) : (
        <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-2">
          {items.map((s) => (
            <SectionRow
              key={s.id}
              section={s}
              onEdit={() => setEditing(s)}
              onToggle={() => onToggle(s)}
              onDelete={() => { if (confirm('Delete this section?')) remove.mutate(s.id) }}
            />
          ))}
        </Reorder.Group>
      )}

      {editing && (
        <SectionModal
          section={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); invalidate() }}
        />
      )}
    </div>
  )
}

// "Add section" split button with a type menu.
function AddMenu({ onPick }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <Button onClick={() => setOpen((o) => !o)}>
        <Icon name="plus" className="h-4 w-4" /> Add section
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-admin-line/10 bg-admin-surface shadow-lg">
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <button
                key={type}
                onClick={() => { setOpen(false); onPick(type) }}
                className="block w-full px-4 py-2.5 text-left text-sm text-admin-text hover:bg-admin-bg"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SectionRow({ section, onEdit, onToggle, onDelete }) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      value={section}
      dragListener={false}
      dragControls={controls}
      className={`flex items-center gap-3 rounded-xl border border-admin-line/10 bg-admin-surface px-3 py-3 ${section.visible ? '' : 'opacity-60'}`}
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab touch-none rounded-lg p-1.5 text-admin-text/40 hover:bg-admin-bg active:cursor-grabbing"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <Icon name="menu" className="h-5 w-5" />
      </button>
      <Badge tone="brand">{TYPE_LABELS[section.type] || section.type}</Badge>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className="truncate font-medium text-admin-text">{section.heading || section.eyebrow || '(no heading)'}</p>
        {section.subheading && <p className="truncate text-xs text-admin-text/45">{section.subheading}</p>}
      </button>
      <Toggle checked={section.visible} onChange={onToggle} />
      <button onClick={onEdit} className="rounded-lg p-2 text-admin-text/60 hover:bg-admin-bg hover:text-as-red" title="Edit">
        <Icon name="pencil" className="h-4 w-4" />
      </button>
      <button onClick={onDelete} className="rounded-lg p-2 text-admin-text/60 hover:bg-red-50 hover:text-red-600" title="Delete">
        <Icon name="trash" className="h-4 w-4" />
      </button>
    </Reorder.Item>
  )
}

function SectionModal({ section, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(section.id)
  const has = HAS[section.type] || {}
  const [form, setForm] = useState({ ...blankSection(section.type), ...section, settings: { ...blankSection(section.type).settings, ...(section.settings || {}) } })
  const [saving, setSaving] = useState(false)

  const { data: categories } = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.listCategories })
  const { data: products } = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: adminApi.listProducts,
    enabled: Boolean(has.product),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setS = (k, v) => setForm((f) => ({ ...f, settings: { ...f.settings, [k]: v } }))

  const save = async () => {
    setSaving(true)
    const payload = {
      type: form.type,
      eyebrow: form.eyebrow,
      heading: form.heading,
      subheading: form.subheading,
      body: form.body,
      imageUrl: form.imageUrl,
      bg: form.bg,
      textTheme: form.textTheme,
      settings: form.settings || {},
      visible: form.visible,
    }
    try {
      if (editing) await adminApi.updateSection(section.id, payload)
      else await adminApi.createSection(payload)
      toast.success(editing ? 'Section saved' : 'Section added')
      onSaved()
    } catch (e) {
      toast.error(e.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${editing ? 'Edit' : 'New'} ${TYPE_LABELS[form.type] || 'section'}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {has.eyebrow && (
          <Field label="Eyebrow" hint="Small label above the heading.">
            <Input value={form.eyebrow} onChange={(e) => set('eyebrow', e.target.value)} />
          </Field>
        )}
        <Field label="Heading">
          <Input value={form.heading} onChange={(e) => set('heading', e.target.value)} autoFocus />
        </Field>
        {has.sub && (
          <Field label="Subheading">
            <Input value={form.subheading} onChange={(e) => set('subheading', e.target.value)} />
          </Field>
        )}
        {has.body && (
          <Field label="Body" hint="Separate paragraphs with a blank line.">
            <Textarea value={form.body} onChange={(e) => set('body', e.target.value)} />
          </Field>
        )}
        {has.align && (
          <Field label="Alignment">
            <Select value={form.settings.align || 'center'} onChange={(e) => setS('align', e.target.value)}>
              <option value="center">Center</option>
              <option value="left">Left</option>
            </Select>
          </Field>
        )}
        {has.image && <ImageField label="Image" value={form.imageUrl} onChange={(v) => set('imageUrl', v)} />}

        {has.product && (
          <HeroProductPicker
            value={form.settings.productId}
            onChange={(v) => setS('productId', v)}
            products={products ?? []}
          />
        )}

        {has.rail && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Products from">
              <Select value={form.settings.category || 'All'} onChange={(e) => setS('category', e.target.value)}>
                <option value="All">All products</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.slug}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Max items" hint="0 = no limit">
              <Input type="number" value={form.settings.limit ?? 0} onChange={(e) => setS('limit', Number(e.target.value) || 0)} />
            </Field>
            <Field label="Anchor id" hint="For #links (e.g. latest)">
              <Input value={form.settings.anchor || ''} onChange={(e) => setS('anchor', e.target.value)} placeholder="latest" />
            </Field>
          </div>
        )}

        {has.buttons && <ButtonsEditor value={form.settings.buttons || []} onChange={(v) => setS('buttons', v)} />}
        {has.tiles && <TilesEditor value={form.settings.tiles || []} onChange={(v) => setS('tiles', v)} />}

        <div className="grid grid-cols-2 gap-4">
          <ColorField label="Background" value={form.bg} onChange={(v) => set('bg', v)} />
          <Field label="Text theme" hint="For contrast on the background.">
            <Select value={form.textTheme || 'auto'} onChange={(e) => set('textTheme', e.target.value)}>
              <option value="auto">Auto</option>
              <option value="light">Light bg (dark text)</option>
              <option value="dark">Dark bg (light text)</option>
            </Select>
          </Field>
        </div>

        <div className="pt-1">
          <Toggle checked={form.visible} onChange={(v) => set('visible', v)} label="Visible on the homepage" />
        </div>
      </div>
    </Modal>
  )
}

// --- Reusable field editors -------------------------------------------------

function ImageField({ label, value, onChange }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const upload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const { url } = await adminApi.upload(file)
      onChange(url)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setUploading(false)
    }
  }
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-admin-bg ring-1 ring-admin-line/10">
          {value && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          )}
        </span>
        <div className="flex-1 space-y-2">
          <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Image URL" />
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : 'Upload image'}
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      </div>
    </Field>
  )
}

function ColorField({ label, value, onChange }) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value || '')
  return (
    <Field label={label} hint="Leave empty for the default.">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-admin-line/15 bg-transparent p-1"
          aria-label="Pick background colour"
        />
        <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="#ffffff" className="font-mono" />
        {value && (
          <button onClick={() => onChange('')} className="shrink-0 rounded-lg p-2 text-admin-text/50 hover:bg-admin-bg" title="Clear">
            <Icon name="close" className="h-4 w-4" />
          </button>
        )}
      </div>
    </Field>
  )
}

// Searchable picker for the hero's featured product. Stores the product id in
// settings.productId; the hero's image, name, price and Shop link all follow it.
function HeroProductPicker({ value, onChange, products }) {
  const [q, setQ] = useState('')
  const selected = products.find((p) => String(p.id) === String(value)) || null
  const matches = q.trim()
    ? products.filter((p) => (p.name || '').toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : []
  return (
    <Field
      label="Featured product"
      hint="The product shown floating in the hero — its image, name, price and Shop link all follow it. Leave empty to auto-pick."
    >
      {selected ? (
        <div className="flex items-center gap-3 rounded-lg border border-admin-line/10 bg-admin-bg/40 p-2">
          {selected.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.image} alt="" className="h-10 w-10 shrink-0 rounded bg-admin-surface object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-admin-text">{selected.name}</p>
            <p className="text-xs text-admin-text/50">${Number(selected.price || 0).toLocaleString()}</p>
          </div>
          <Button variant="secondary" onClick={() => onChange(null)}>Change</Button>
        </div>
      ) : (
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products by name…" />
          {matches.length > 0 && (
            <ul className="mt-1 max-h-56 divide-y divide-admin-line/5 overflow-auto rounded-lg border border-admin-line/10">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(p.id); setQ('') }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-admin-bg"
                  >
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-8 w-8 shrink-0 rounded bg-admin-surface object-contain" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-admin-text">{p.name}</span>
                    <span className="shrink-0 text-xs text-admin-text/50">${Number(p.price || 0).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Field>
  )
}

function ButtonsEditor({ value, onChange }) {
  const update = (i, k, v) => {
    const next = [...value]
    next[i] = { ...next[i], [k]: v }
    onChange(next)
  }
  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-admin-text">Buttons</span>
      {value.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={b.label || ''} onChange={(e) => update(i, 'label', e.target.value)} placeholder="Label" className="flex-1" />
          <Input value={b.href || ''} onChange={(e) => update(i, 'href', e.target.value)} placeholder="#latest or /category/audio" className="flex-1" />
          <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="shrink-0 rounded-lg p-2 text-admin-text/50 hover:bg-red-50 hover:text-red-600" title="Remove">
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...value, { label: '', href: '' }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-as-red hover:underline">
        <Icon name="plus" className="h-4 w-4" /> Add button
      </button>
    </div>
  )
}

function TilesEditor({ value, onChange }) {
  const update = (i, patch) => {
    const next = [...value]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }
  return (
    <div className="space-y-3">
      <span className="block text-sm font-semibold text-admin-text">Tiles</span>
      {value.map((t, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-admin-line/10 p-3">
          <div className="flex items-center gap-2">
            <Input value={t.title || ''} onChange={(e) => update(i, { title: e.target.value })} placeholder="Title" className="flex-1 font-medium" />
            <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="shrink-0 rounded-lg p-2 text-admin-text/50 hover:bg-red-50 hover:text-red-600" title="Remove tile">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </div>
          <Input value={t.copy || ''} onChange={(e) => update(i, { copy: e.target.value })} placeholder="Short copy" />
          <ImageField label="Tile image" value={t.image} onChange={(v) => update(i, { image: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={t.tone || ''} onChange={(e) => update(i, { tone: e.target.value })}>
              <option value="">Light tile</option>
              <option value="dark">Dark tile</option>
            </Select>
            <Select value={t.span || ''} onChange={(e) => update(i, { span: e.target.value })}>
              <option value="">Normal width</option>
              <option value="lg:col-span-2">Wide (2 columns)</option>
            </Select>
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...value, { title: '', copy: '', image: '', tone: '', span: '' }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-as-red hover:underline">
        <Icon name="plus" className="h-4 w-4" /> Add tile
      </button>
    </div>
  )
}
