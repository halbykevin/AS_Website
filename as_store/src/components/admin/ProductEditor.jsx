'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import ProductTile from '@/components/ProductTile.jsx'
import { Button, Card, Field, Input, Textarea, Select, Toggle, Spinner } from './ui.jsx'
import { useToast } from './toast.jsx'
import { adminApi } from '@/lib/adminApi'
import { orderedCategoryOptions } from '@/lib/categoryTree'

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const BLANK = {
  name: '', slug: '', tagline: '', description: '', price: '', oldPrice: '',
  categoryId: '', brandId: '', stock: '0', isNew: true, featured: false, visible: true,
  colors: [], specs: [],
}

export default function ProductEditor({ id }) {
  const editing = Boolean(id)
  const router = useRouter()
  const qc = useQueryClient()
  const toast = useToast()

  const [form, setForm] = useState(BLANK)
  const [images, setImages] = useState([]) // edit: [{id,url}]  | new: [{url}]
  const [newColor, setNewColor] = useState('#1d1d1f')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const slugTouched = useRef(false)
  const fileRef = useRef(null)

  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.listCategories })
  const brands = useQuery({ queryKey: ['admin', 'brands'], queryFn: adminApi.listBrands })
  const products = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: adminApi.listProducts,
    enabled: editing,
  })
  const imagesQuery = useQuery({
    queryKey: ['admin', 'product-images', id],
    queryFn: () => adminApi.listImages(id),
    enabled: editing,
  })

  // Seed the form from the fetched product (once).
  const seeded = useRef(false)
  useEffect(() => {
    if (!editing || seeded.current || !products.data) return
    const p = products.data.find((x) => String(x.id) === String(id))
    if (!p) return
    seeded.current = true
    slugTouched.current = true
    setForm({
      name: p.name || '', slug: p.slug || '', tagline: p.tagline || '',
      description: p.description || '', price: String(p.price ?? ''),
      oldPrice: p.oldPrice != null ? String(p.oldPrice) : '',
      categoryId: p.categoryId != null ? String(p.categoryId) : '',
      brandId: p.brandId != null ? String(p.brandId) : '',
      stock: String(p.stock ?? 0), isNew: !!p.isNew, featured: !!p.featured,
      visible: p.visible !== false, colors: Array.isArray(p.colors) ? p.colors : [],
      specs: Array.isArray(p.specs) ? p.specs.filter((r) => Array.isArray(r) && r.length >= 2) : [],
    })
  }, [editing, id, products.data])

  useEffect(() => {
    if (editing && imagesQuery.data) setImages(imagesQuery.data)
  }, [editing, imagesQuery.data])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const onName = (v) => {
    set('name', v)
    if (!slugTouched.current) set('slug', slugify(v))
  }

  const previewImage = images[0]?.url || ''
  const preview = useMemo(
    () => ({
      id: 'preview',
      name: form.name || 'Product name',
      tagline: form.tagline || 'A short, punchy tagline.',
      price: Number(form.price) || 0,
      image: previewImage,
      colors: form.colors,
    }),
    [form.name, form.tagline, form.price, form.colors, previewImage],
  )

  // ---- colors ----
  const addColor = () => {
    if (form.colors.includes(newColor)) return
    set('colors', [...form.colors, newColor])
  }
  const removeColor = (c) => set('colors', form.colors.filter((x) => x !== c))

  // ---- specs (label/value rows) ----
  const addSpec = () => set('specs', [...form.specs, ['', '']])
  const updateSpec = (i, j, v) =>
    set('specs', form.specs.map((row, idx) => (idx === i ? (j === 0 ? [v, row[1]] : [row[0], v]) : row)))
  const removeSpec = (i) => set('specs', form.specs.filter((_, idx) => idx !== i))

  // ---- images ----
  const addImageUrl = async (url) => {
    if (!url) return
    if (editing) {
      try {
        const row = await adminApi.addImage(id, url)
        setImages((arr) => [...arr, row])
        qc.invalidateQueries({ queryKey: ['admin', 'products'] })
      } catch (e) {
        toast.error(e.message)
      }
    } else {
      setImages((arr) => [...arr, { url }])
    }
    setNewImageUrl('')
  }
  const removeImage = async (img, idx) => {
    if (editing && img.id) {
      try {
        await adminApi.deleteImage(id, img.id)
        setImages((arr) => arr.filter((x) => x.id !== img.id))
        qc.invalidateQueries({ queryKey: ['admin', 'products'] })
      } catch (e) {
        toast.error(e.message)
      }
    } else {
      setImages((arr) => arr.filter((_, i) => i !== idx))
    }
  }
  const onUpload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const { url } = await adminApi.upload(file)
      await addImageUrl(url)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ---- save ----
  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Name is required')
    if (form.price === '' || isNaN(Number(form.price))) return toast.error('Valid price is required')
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      tagline: form.tagline,
      description: form.description,
      price: Number(form.price),
      oldPrice: form.oldPrice === '' ? null : Number(form.oldPrice),
      categoryId: form.categoryId === '' ? null : Number(form.categoryId),
      brandId: form.brandId === '' ? null : Number(form.brandId),
      stock: Number(form.stock) || 0,
      isNew: form.isNew,
      featured: form.featured,
      visible: form.visible,
      colors: form.colors,
      specs: form.specs.filter(([k, v]) => String(k).trim() && String(v).trim()),
    }
    try {
      if (editing) {
        await adminApi.updateProduct(id, payload)
        toast.success('Product saved')
      } else {
        await adminApi.createProduct({ ...payload, images: images.map((i) => i.url) })
        toast.success('Product created')
      }
      qc.invalidateQueries({ queryKey: ['admin', 'products'] })
      router.push('/admin/products')
    } catch (err) {
      toast.error(err.message)
      setSaving(false)
    }
  }

  if (editing && (products.isLoading || imagesQuery.isLoading)) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/products" className="rounded-lg p-2 text-admin-text/60 hover:bg-admin-surface" aria-label="Back">
            <Icon name="chevronLeft" className="h-5 w-5" />
          </Link>
          <h2 className="text-xl font-bold text-admin-text">{editing ? 'Edit product' : 'New product'}</h2>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" as={Link} href="/admin/products">
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Form */}
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => onName(e.target.value)} placeholder="Aurora Pro 5G" />
            </Field>
            <Field label="Slug" hint="Used in the product URL. Auto-generated from the name.">
              <Input
                value={form.slug}
                onChange={(e) => {
                  slugTouched.current = true
                  set('slug', e.target.value)
                }}
                placeholder="aurora-pro-5g"
              />
            </Field>
            <Field label="Tagline">
              <Input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Brilliant. In every sense." />
            </Field>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Full product description…" />
            </Field>
          </Card>

          <Card className="grid grid-cols-2 gap-4 p-5">
            <Field label="Price ($)">
              <Input type="number" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Compare-at price ($)" hint="Optional — shows as a strikethrough.">
              <Input type="number" step="0.01" value={form.oldPrice} onChange={(e) => set('oldPrice', e.target.value)} placeholder="—" />
            </Field>
            <Field label="Category">
              <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">— None —</option>
                {orderedCategoryOptions(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.depth ? ' ↳ ' : ''}
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Brand">
              <Select value={form.brandId} onChange={(e) => set('brandId', e.target.value)}>
                <option value="">— None —</option>
                {(brands.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Stock">
              <Input type="number" value={form.stock} onChange={(e) => set('stock', e.target.value)} />
            </Field>
          </Card>

          {/* Colors */}
          <Card className="space-y-3 p-5">
            <p className="text-sm font-semibold text-admin-text">Colors</p>
            <div className="flex flex-wrap items-center gap-2">
              {form.colors.map((c) => (
                <span key={c} className="group relative">
                  <span className="block h-8 w-8 rounded-full ring-1 ring-black/10" style={{ background: c }} />
                  <button
                    type="button"
                    onClick={() => removeColor(c)}
                    className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-admin-invert text-[10px] text-white group-hover:flex"
                    aria-label={`Remove ${c}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
              {form.colors.length === 0 && <span className="text-sm text-admin-text/40">No colors yet.</span>}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-admin-line/15 bg-admin-surface"
              />
              <Input value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-32" />
              <Button type="button" variant="secondary" onClick={addColor}>
                Add color
              </Button>
            </div>
          </Card>

          {/* Specifications table */}
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-admin-text">Specifications</p>
              <span className="text-xs text-admin-text/40">Shown in the product&apos;s Specifications tab</span>
            </div>
            {form.specs.length === 0 && (
              <p className="text-sm text-admin-text/40">No specifications yet.</p>
            )}
            <div className="space-y-2">
              {form.specs.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={row[0]}
                    onChange={(e) => updateSpec(i, 0, e.target.value)}
                    placeholder="Label (e.g. Processor)"
                    className="w-1/3"
                  />
                  <Input
                    value={row[1]}
                    onChange={(e) => updateSpec(i, 1, e.target.value)}
                    placeholder="Value (e.g. Intel Core i9-14900HX)"
                  />
                  <button
                    type="button"
                    onClick={() => removeSpec(i)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-admin-text/40 transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove specification"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" onClick={addSpec}>
              Add specification
            </Button>
          </Card>

          {/* Images */}
          <Card className="space-y-3 p-5">
            <p className="text-sm font-semibold text-admin-text">Images</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {images.map((img, i) => (
                <div key={img.id ?? i} className="group relative aspect-square overflow-hidden rounded-xl bg-admin-bg ring-1 ring-admin-line/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-admin-invert/85 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Primary
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(img, i)}
                    className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white group-hover:flex"
                    aria-label="Remove image"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-admin-line/15 text-admin-text/40 transition hover:border-as-red hover:text-as-red"
              >
                {uploading ? <Spinner /> : <Icon name="upload" className="h-6 w-6" />}
                <span className="text-xs font-medium">{uploading ? 'Uploading…' : 'Upload'}</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onUpload(e.target.files?.[0])}
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                placeholder="…or paste an image URL"
              />
              <Button type="button" variant="secondary" onClick={() => addImageUrl(newImageUrl)}>
                Add
              </Button>
            </div>
          </Card>
        </div>

        {/* Sidebar: flags + live preview */}
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <p className="text-sm font-semibold text-admin-text">Visibility</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-admin-text/70">Visible on store</span>
              <Toggle checked={form.visible} onChange={(v) => set('visible', v)} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-admin-text/70">Featured</span>
              <Toggle checked={form.featured} onChange={(v) => set('featured', v)} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-admin-text/70">Mark as new</span>
              <Toggle checked={form.isNew} onChange={(v) => set('isNew', v)} />
            </div>
          </Card>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-text/40">Live preview</p>
            <div className="rounded-2xl bg-admin-surface p-4 ring-1 ring-admin-line/10">
              <ProductTile product={preview} />
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
