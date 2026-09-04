import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Banner, Button, Card, Field, PageHeader, SaveBar, SegmentedControl, Select, TextInput, Toggle } from '../ui.jsx'

// The homepage AS Store panel — a slideshow of real AS Store products.
//
// The products are NOT stored here: this page saves a choice (a random sample,
// or specific product ids) and the API reads the live store catalog to fill it
// in. So a product that gets renamed, re-photographed or hidden in the store is
// renamed, re-photographed or gone from the banner too, with nothing to redo
// here. That is also why the picker searches the store's catalog rather than an
// upload form: there is nothing to upload.
//
// Prices are deliberately absent from the banner. See StoreBanner.jsx.

const BLANK = { enabled: true, mode: 'random', perSlide: 3, count: 12, productIds: [] }

export default function StoreBannerAdmin() {
  const [form, setForm] = useState(BLANK)
  const [chosen, setChosen] = useState([]) // resolved products for form.productIds
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [resultTotal, setResultTotal] = useState(0)
  const [searching, setSearching] = useState(false)
  const [catalogDown, setCatalogDown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const searchSeq = useRef(0)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const resolveChosen = useCallback(async (ids) => {
    if (!ids.length) return setChosen([])
    try {
      const { products } = await adminApi.storeBannerProductsByIds(ids)
      setChosen(products || [])
    } catch {
      setChosen([])
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const b = await adminApi.getStoreBanner()
        const next = { ...BLANK, ...b, productIds: Array.isArray(b?.productIds) ? b.productIds : [] }
        delete next.products // the resolved preview list — not part of the form
        setForm(next)
        await resolveChosen(next.productIds)
      } catch {
        setMsg({ kind: 'error', text: 'Could not load the store banner. Is the API running and migrated?' })
      }
    })()
  }, [resolveChosen])

  // Catalog search, debounced. Searching an empty box lists the start of the
  // catalog, which is a usable "browse" state.
  useEffect(() => {
    const seq = ++searchSeq.current
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const { products, total } = await adminApi.storeBannerCatalog(search, 40)
        if (seq !== searchSeq.current) return // a newer keystroke already won
        setResults(products || [])
        setResultTotal(total || 0)
        setCatalogDown(false)
      } catch {
        if (seq !== searchSeq.current) return
        setResults([])
        setResultTotal(0)
        setCatalogDown(true)
      } finally {
        if (seq === searchSeq.current) setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  const chosenIds = useMemo(() => new Set(form.productIds.map(String)), [form.productIds])

  const add = (p) => {
    if (chosenIds.has(String(p.id))) return
    setForm((f) => ({ ...f, productIds: [...f.productIds, p.id] }))
    setChosen((c) => [...c, p])
  }

  const remove = (id) => {
    setForm((f) => ({ ...f, productIds: f.productIds.filter((v) => String(v) !== String(id)) }))
    setChosen((c) => c.filter((p) => String(p.id) !== String(id)))
  }

  const move = (id, dir) => {
    const i = form.productIds.findIndex((v) => String(v) === String(id))
    const j = i + dir
    if (i < 0 || j < 0 || j >= form.productIds.length) return
    const ids = [...form.productIds]
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    const list = [...chosen]
    ;[list[i], list[j]] = [list[j], list[i]]
    setForm((f) => ({ ...f, productIds: ids }))
    setChosen(list)
  }

  async function save(e) {
    e?.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      await adminApi.saveStoreBanner(form)
      setMsg({ kind: 'success', text: 'Store banner saved.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    } finally {
      setSaving(false)
    }
  }

  // A picked product that no longer resolves has been hidden or removed in the
  // store. Saying so here is the only place anyone would find out — the banner
  // itself just shows one card fewer.
  const missing = form.productIds.length - chosen.length

  return (
    <form onSubmit={save} className="space-y-6">
      <PageHeader
        title="Store Slideshow"
        description="The AS Store panel on the homepage — a slideshow of real products from the store. Tapping one opens it on the store."
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      {catalogDown && (
        <Banner kind="warning">
          The AS Store catalog can’t be reached right now, so the picker is empty. The banner keeps
          showing whatever it last loaded; check that the store API is running.
        </Banner>
      )}

      <Card title="Slideshow">
        <div className="space-y-5">
          <Toggle
            checked={form.enabled}
            onChange={(v) => set('enabled', v)}
            label="Show the slideshow"
            description="Off: the panel shows the AS Store logo on its own, and still opens the store."
          />

          <Field label="Which products" hint="Random keeps the homepage different on every visit.">
            <SegmentedControl
              value={form.mode}
              onChange={(v) => set('mode', v)}
              options={[
                { value: 'random', label: 'Random products' },
                { value: 'specific', label: 'Specific products' },
              ]}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Products per slide" hint="On phones this caps at 2 — three cards don’t fit.">
              <Select value={form.perSlide} onChange={(e) => set('perSlide', Number(e.target.value))}>
                <option value={2}>2 products</option>
                <option value={3}>3 products</option>
                <option value={4}>4 products</option>
              </Select>
            </Field>
            {form.mode === 'random' && (
              <Field label="How many to rotate through" hint="Picked fresh from the catalog on each visit.">
                <TextInput
                  type="number"
                  min={2}
                  max={40}
                  value={form.count}
                  onChange={(e) => set('count', Number(e.target.value) || 12)}
                />
              </Field>
            )}
          </div>
        </div>
      </Card>

      {form.mode === 'specific' && (
        <Card title={`Chosen products (${form.productIds.length})`}>
          {form.productIds.length === 0 ? (
            <p className="text-sm text-as-charcoal/55">
              Nothing picked yet. Search the store catalog below and add the products you want the
              banner to show, in order.
            </p>
          ) : (
            <>
              {missing > 0 && (
                <Banner kind="warning">
                  {missing} chosen {missing === 1 ? 'product is' : 'products are'} no longer in the
                  store catalog (hidden or deleted). They are skipped in the banner — remove and
                  replace them below.
                </Banner>
              )}
              <ul className="mt-3 space-y-2">
                {chosen.map((p, i) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl border border-black/10 bg-white p-2.5"
                  >
                    <span className="w-6 shrink-0 text-center text-xs font-semibold text-as-charcoal/40">
                      {i + 1}
                    </span>
                    <img
                      src={p.image}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-contain"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-as-charcoal">{p.name}</p>
                      <p className="truncate text-xs text-as-charcoal/45">{p.brand || '—'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" className="!px-3 !py-1.5" onClick={() => move(p.id, -1)} aria-label="Move up">
                        ↑
                      </Button>
                      <Button type="button" variant="ghost" className="!px-3 !py-1.5" onClick={() => move(p.id, 1)} aria-label="Move down">
                        ↓
                      </Button>
                      <Button type="button" variant="danger" className="!px-3 !py-1.5" onClick={() => remove(p.id)} aria-label="Remove">
                        ✕
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {form.mode === 'specific' && (
        <Card title="AS Store catalog">
          <Field label="Search" hint="By product name or brand — straight from the live store catalog.">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="iPhone, Logitech, monitor…"
            />
          </Field>
          <p className="mt-2 text-xs text-as-charcoal/45">
            {searching ? 'Searching…' : `${resultTotal} product${resultTotal === 1 ? '' : 's'} match — showing the first ${results.length}.`}
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {results.map((p) => {
              const already = chosenIds.has(String(p.id))
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-black/10 bg-white p-2.5"
                >
                  <img
                    src={p.image}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-contain"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-as-charcoal">{p.name}</p>
                    <p className="truncate text-xs text-as-charcoal/45">{p.brand || '—'}</p>
                  </div>
                  <Button
                    type="button"
                    variant={already ? 'ghost' : 'primary'}
                    className="!px-4 !py-1.5"
                    onClick={() => add(p)}
                    disabled={already}
                  >
                    {already ? 'Added' : 'Add'}
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <SaveBar
        saving={saving}
        message={
          form.mode === 'specific'
            ? `${form.productIds.length} product${form.productIds.length === 1 ? '' : 's'}, ${form.perSlide} per slide.`
            : `${form.count} random products, ${form.perSlide} per slide.`
        }
      />
    </form>
  )
}
