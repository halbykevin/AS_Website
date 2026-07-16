'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import Icon from './Icon.jsx'
import { SORTS, COLS } from '@/lib/catalogFilters'

const money = (n) => `$${Number(n || 0).toLocaleString()}`
const EASE = [0.22, 0.61, 0.36, 1]

// Sort + filter bar for a product listing. All state lives in the URL
// (?sort=&brand=&min=&max=&sale=1&cols=) so it's shareable and back-button
// friendly. Desktop shows an inline pill toolbar; mobile collapses to Sort and
// Filter buttons that open bottom sheets.
export default function ProductFilters({ categories = [], brands = [], bounds = { min: 0, max: 0 }, total = 0 }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const get = (k) => sp.get(k) || ''
  const [sheet, setSheet] = useState(null) // null | 'sort' | 'filter'

  const setParams = (patch) => {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v == null) next.delete(k)
      else next.set(k, String(v))
    }
    // Changing what's in the list invalidates the current page — go back to
    // the first one. Density only changes the layout, so it keeps the page.
    if (Object.keys(patch).some((k) => k !== 'cols')) next.delete('page')
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const sort = get('sort') || 'featured'
  const cat = get('cat')
  const brand = get('brand')
  const saleOn = get('sale') === '1'
  const cols = get('cols') // '' = Auto (responsive)
  const hasPrice = bounds.max > bounds.min
  const activeCount = (cat ? 1 : 0) + (brand ? 1 : 0) + (get('min') || get('max') ? 1 : 0) + (saleOn ? 1 : 0)
  const hasAny = activeCount > 0 || sort !== 'featured'

  return (
    <div className="mt-8 flex items-center justify-between gap-3 border-b border-as-ink/10 pb-5">
      <p className="shrink-0 text-sm font-medium text-as-ink/45">
        {total} {total === 1 ? 'product' : 'products'}
      </p>

      {/* Desktop toolbar */}
      <div className="hidden flex-wrap items-center justify-end gap-2 md:flex">
        <PillSelect ariaLabel="Sort by" value={sort} onChange={(v) => setParams({ sort: v === 'featured' ? '' : v })}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </PillSelect>

        {categories.length > 0 && (
          <PillSelect ariaLabel="Filter by category" value={cat} onChange={(v) => setParams({ cat: v })}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>{c.label} ({c.count})</option>
            ))}
          </PillSelect>
        )}

        {brands.length > 0 && (
          <PillSelect ariaLabel="Filter by brand" value={brand} onChange={(v) => setParams({ brand: v })}>
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.value} value={b.value}>{b.label} ({b.count})</option>
            ))}
          </PillSelect>
        )}

        {hasPrice && (
          <PricePopover
            bounds={bounds}
            min={get('min')}
            max={get('max')}
            onCommit={({ min, max }) => setParams({ min, max })}
          />
        )}

        <button
          onClick={() => setParams({ sale: saleOn ? '' : '1' })}
          aria-pressed={saleOn}
          className={`h-10 rounded-full border px-4 text-sm font-medium transition ${
            saleOn ? 'border-as-red bg-as-red text-white shadow-sm' : 'border-as-ink/15 text-as-ink hover:border-as-ink/30'
          }`}
        >
          On sale
        </button>

        <DensityToggle className="hidden md:flex" value={cols} onChange={(v) => setParams({ cols: v })} />

        {hasAny && (
          <button
            onClick={() => router.push(pathname, { scroll: false })}
            className="inline-flex h-10 items-center gap-1 px-2 text-sm font-medium text-as-ink/45 hover:text-as-red"
          >
            <Icon name="close" className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Mobile: Sort + Filter buttons */}
      <div className="flex items-center gap-2 md:hidden">
        <button
          onClick={() => setSheet('sort')}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-as-ink/15 px-4 text-sm font-medium text-as-ink"
        >
          <Icon name="sort" className="h-4 w-4 text-as-ink/50" /> Sort
        </button>
        <button
          onClick={() => setSheet('filter')}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-as-ink/15 px-4 text-sm font-medium text-as-ink"
        >
          <Icon name="filter" className="h-4 w-4 text-as-ink/50" /> Filter
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-as-red px-1 text-[11px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Sort sheet */}
      <Sheet open={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by">
        <div className="-mt-1">
          {SORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setParams({ sort: s.value === 'featured' ? '' : s.value })
                setSheet(null)
              }}
              className="flex w-full items-center justify-between border-b border-as-ink/8 py-3.5 text-left text-base text-as-ink last:border-0"
            >
              {s.label}
              {sort === s.value && <Icon name="check" className="h-5 w-5 text-as-red" />}
            </button>
          ))}
        </div>
      </Sheet>

      {/* Filter sheet */}
      <Sheet
        open={sheet === 'filter'}
        onClose={() => setSheet(null)}
        title="Filter"
        footer={
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push(pathname, { scroll: false })}
              className="text-sm font-medium text-as-ink/50 hover:text-as-red"
            >
              Clear all
            </button>
            <button onClick={() => setSheet(null)} className="pill px-8">
              Show {total}
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {categories.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-as-ink/45">Category</p>
              <FullSelect value={cat} onChange={(v) => setParams({ cat: v })}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>{c.label} ({c.count})</option>
                ))}
              </FullSelect>
            </div>
          )}

          {brands.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-as-ink/45">Brand</p>
              <FullSelect value={brand} onChange={(v) => setParams({ brand: v })}>
                <option value="">All brands</option>
                {brands.map((b) => (
                  <option key={b.value} value={b.value}>{b.label} ({b.count})</option>
                ))}
              </FullSelect>
            </div>
          )}

          {hasPrice && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-as-ink/45">Price</p>
              <PriceSlider bounds={bounds} min={get('min')} max={get('max')} onCommit={({ min, max }) => setParams({ min, max })} />
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-as-ink">On sale only</span>
            <button
              onClick={() => setParams({ sale: saleOn ? '' : '1' })}
              aria-pressed={saleOn}
              className={`relative h-6 w-11 rounded-full transition ${saleOn ? 'bg-as-red' : 'bg-as-ink/20'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${saleOn ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-as-ink">Per row</span>
            <DensityToggle value={cols} onChange={(v) => setParams({ cols: v })} />
          </div>
        </div>
      </Sheet>
    </div>
  )
}

// Native <select> styled as a pill, with our own chevron.
function PillSelect({ value, onChange, children, ariaLabel }) {
  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 cursor-pointer appearance-none rounded-full border border-as-ink/15 bg-white pl-4 pr-9 text-sm font-medium text-as-ink outline-none transition hover:border-as-ink/30 focus:border-as-ink/40"
      >
        {children}
      </select>
      <Icon name="chevronDown" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-as-ink/40" />
    </div>
  )
}

// Full-width select (used inside the mobile filter sheet).
function FullSelect({ value, onChange, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-as-ink/15 bg-white pl-4 pr-9 text-sm font-medium text-as-ink outline-none focus:border-as-red"
      >
        {children}
      </select>
      <Icon name="chevronDown" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-as-ink/40" />
    </div>
  )
}

// Desktop "Price" pill that opens a popover holding the slider.
function PricePopover({ bounds, min, max, onCommit }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const active = Boolean(min || max)
  const label = active ? `${money(min || bounds.min)} – ${money(max || bounds.max)}` : 'Price'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition ${
          active ? 'border-as-ink/40 text-as-ink' : 'border-as-ink/15 text-as-ink hover:border-as-ink/30'
        }`}
      >
        {label}
        <Icon name="chevronDown" className="h-4 w-4 text-as-ink/40" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-as-ink/10 bg-white p-5 shadow-xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-as-ink/45">Price</p>
          <PriceSlider bounds={bounds} min={min} max={max} onCommit={onCommit} />
          {active && (
            <button onClick={() => onCommit({ min: '', max: '' })} className="mt-4 text-xs font-medium text-as-ink/45 hover:text-as-red">
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Dual-handle range slider bounded by the real min/max. Commits to the URL on
// release. Empty values mean "at the bound" (so they drop out of the URL).
function PriceSlider({ bounds, min, max, onCommit }) {
  const [lo, setLo] = useState(min ? Number(min) : bounds.min)
  const [hi, setHi] = useState(max ? Number(max) : bounds.max)

  useEffect(() => {
    setLo(min ? Number(min) : bounds.min)
    setHi(max ? Number(max) : bounds.max)
  }, [min, max, bounds.min, bounds.max])

  const span = Math.max(1, bounds.max - bounds.min)
  const pct = (v) => ((v - bounds.min) / span) * 100
  const commit = () =>
    onCommit({ min: lo > bounds.min ? lo : '', max: hi < bounds.max ? hi : '' })

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm font-medium text-as-ink">
        <span>{money(lo)}</span>
        <span>{money(hi)}</span>
      </div>
      <div className="relative h-5">
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-as-ink/15" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-as-red"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input
          type="range"
          className="range"
          min={bounds.min}
          max={bounds.max}
          value={lo}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi))}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          aria-label="Minimum price"
        />
        <input
          type="range"
          className="range"
          min={bounds.min}
          max={bounds.max}
          value={hi}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo))}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          aria-label="Maximum price"
        />
      </div>
    </div>
  )
}

function GridGlyph({ n }) {
  return (
    <span className="flex items-center gap-[3px]">
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="h-3.5 w-[3px] rounded-full bg-current" />
      ))}
    </span>
  )
}

function DensityToggle({ value, onChange, className = '' }) {
  const itemCls = (active) =>
    `flex h-9 items-center justify-center rounded-full transition ${
      active ? 'bg-as-ink text-white' : 'text-as-ink/40 hover:text-as-ink'
    }`
  return (
    <div className={`flex items-center rounded-full border border-as-ink/15 p-0.5 ${className}`}>
      <button
        onClick={() => onChange('')}
        aria-pressed={value === ''}
        className={`${itemCls(value === '')} px-3 text-xs font-semibold`}
      >
        Auto
      </button>
      {COLS.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          aria-label={`${n} per row`}
          className={`${itemCls(value === n)} w-9`}
        >
          <GridGlyph n={Number(n)} />
        </button>
      ))}
    </div>
  )
}

// Mobile bottom sheet.
function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <motion.div
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-3xl bg-white"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.32, ease: EASE }}
          >
            <div className="px-5 pt-3">
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-as-ink/15" />
              <div className="flex items-center justify-between pb-2">
                <h3 className="text-lg font-semibold tracking-apple text-as-ink">{title}</h3>
                <button onClick={onClose} className="rounded-lg p-1.5 text-as-ink/50 hover:bg-as-fog" aria-label="Close">
                  <Icon name="close" className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
            {footer && <div className="border-t border-as-ink/10 p-5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
