'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import Icon from '../Icon.jsx'
import Highlight from './Highlight.jsx'
import {
  EMPTY_RESULT,
  MIN_QUERY,
  cachedSuggestions,
  clearRecent,
  fetchSuggestions,
  normalizeQuery,
  pushRecent,
  readRecent,
  removeRecent,
} from '@/lib/search'

const DEBOUNCE_MS = 180
const optionId = (i) => `as-search-option-${i}`

const money = (n) => `$${(Number(n) || 0).toLocaleString()}`

/* ---- Rows -------------------------------------------------------------- */

function Thumb({ src, icon = 'box', className = '' }) {
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-as-ink/10 ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
      ) : (
        <Icon name={icon} className="h-5 w-5 text-as-ink/25" />
      )}
    </span>
  )
}

function ProductRow({ product, query }) {
  const price = Number(product.price) || 0
  const oldPrice = product.oldPrice ? Number(product.oldPrice) : null
  const onSale = Boolean(oldPrice) && oldPrice > price
  const meta = [product.brand, product.category].filter(Boolean).join(' · ')
  return (
    <>
      <Thumb src={product.image} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 text-[14px] font-medium text-as-ink">
          <Highlight text={product.name} query={query} />
        </span>
        {meta && (
          <span className="line-clamp-1 text-[12px] text-as-ink/45">
            <Highlight text={meta} query={query} />
          </span>
        )}
      </span>
      <span className="shrink-0 text-right text-[13px] leading-tight">
        <span className={onSale ? 'font-semibold text-as-red' : 'text-as-ink'}>{money(price)}</span>
        {onSale && <span className="block text-[11px] text-as-ink/35 line-through">{money(oldPrice)}</span>}
      </span>
    </>
  )
}

function FacetRow({ item, query, icon }) {
  const count = Number(item.productCount)
  return (
    <>
      <Thumb src={item.imageUrl} icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 text-[14px] font-medium text-as-ink">
          <Highlight text={item.name} query={query} />
        </span>
        {Number.isFinite(count) && count > 0 && (
          <span className="text-[12px] text-as-ink/45">
            {count} product{count === 1 ? '' : 's'}
          </span>
        )}
      </span>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-as-ink/25" />
    </>
  )
}

function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-3 px-3 py-2.5">
      <span className="h-11 w-11 shrink-0 rounded-xl bg-as-fog" />
      <span className="flex-1 space-y-2">
        <span className="block h-3 w-2/3 rounded bg-as-fog" />
        <span className="block h-2.5 w-1/3 rounded bg-as-fog" />
      </span>
      <span className="h-3 w-12 rounded bg-as-fog" />
    </div>
  )
}

/* ---- Panel ------------------------------------------------------------- */

function SearchPanel({ onClose, categories }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [data, setData] = useState(EMPTY_RESULT)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [recent, setRecent] = useState([])
  const [active, setActive] = useState(-1) // -1 = the input itself
  const [attempt, setAttempt] = useState(0) // bumped by "Try again"
  const panelRef = useRef(null)
  const inputRef = useRef(null)

  const term = normalizeQuery(q)
  const searching = term.length >= MIN_QUERY

  useEffect(() => setRecent(readRecent()), [])

  // Lock the page behind the dialog (padding compensates for the scrollbar so
  // the layout doesn't jump) and hand focus back to the trigger on close.
  useEffect(() => {
    const opener = document.activeElement
    const { body } = document
    const prevOverflow = body.style.overflow
    const prevPad = body.style.paddingRight
    const gap = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (gap > 0) body.style.paddingRight = `${gap}px`
    inputRef.current?.focus()
    return () => {
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPad
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  // Debounced + aborted suggest. A cached page paints immediately so results
  // never flash empty while the shopper backspaces.
  useEffect(() => {
    if (!searching) {
      setData(EMPTY_RESULT)
      setStatus('idle')
      return
    }
    const cached = cachedSuggestions(term)
    if (cached) {
      setData(cached)
      setStatus('ready')
      return
    }
    setStatus('loading')
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      fetchSuggestions(term, { signal: ctrl.signal })
        .then((result) => {
          setData(result)
          setStatus('ready')
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') setStatus('error')
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [term, searching, attempt])

  useEffect(() => setActive(-1), [term])

  const popular = useMemo(
    () => categories.filter((c) => c.visible !== false && !c.parentId).slice(0, 6),
    [categories],
  )

  // One flat model for both panels — the keyboard walks `hits` while the render
  // walks `sections`, so grouped results stay navigable as a single list.
  const sections = useMemo(() => {
    const out = []
    if (!searching) {
      if (recent.length) {
        out.push({
          id: 'recent',
          label: 'Recent searches',
          items: recent.map((text) => ({
            kind: 'query',
            key: `q:${text}`,
            label: text,
            href: `/search?q=${encodeURIComponent(text)}`,
          })),
        })
      }
      if (popular.length) {
        out.push({
          id: 'browse',
          label: 'Browse categories',
          items: popular.map((c) => ({
            kind: 'category',
            key: `c:${c.id}`,
            label: c.name,
            href: `/category/${c.slug}`,
            data: c,
          })),
        })
      }
      return out
    }
    if (data.products.length) {
      out.push({
        id: 'products',
        label: 'Products',
        items: data.products.map((p) => ({
          kind: 'product',
          key: `p:${p.id}`,
          label: p.name,
          href: p.slug ? `/product/${p.slug}` : `/search?q=${encodeURIComponent(term)}`,
          data: p,
        })),
      })
    }
    if (data.categories.length) {
      out.push({
        id: 'categories',
        label: 'Categories',
        items: data.categories.map((c) => ({
          kind: 'category',
          key: `c:${c.id}`,
          label: c.name,
          href: `/category/${c.slug}`,
          data: c,
        })),
      })
    }
    if (data.brands.length) {
      out.push({
        id: 'brands',
        label: 'Brands',
        items: data.brands.map((b) => ({
          kind: 'brand',
          key: `b:${b.id}`,
          label: b.name,
          href: `/shop?brand=${encodeURIComponent(b.slug)}`,
          data: b,
        })),
      })
    }
    if (out.length) {
      out.push({
        id: 'all',
        items: [
          {
            kind: 'all',
            key: 'all',
            label: `See all ${data.total} result${data.total === 1 ? '' : 's'}`,
            href: `/search?q=${encodeURIComponent(term)}`,
          },
        ],
      })
    }
    return out
  }, [searching, recent, popular, data, term])

  const hits = useMemo(() => sections.flatMap((s) => s.items), [sections])

  const go = useCallback(
    (hit) => {
      if (!hit?.href) return
      pushRecent(hit.kind === 'query' ? hit.label : term)
      router.push(hit.href)
      onClose()
    },
    [router, onClose, term],
  )

  const submit = (e) => {
    e?.preventDefault()
    if (active >= 0 && hits[active]) return go(hits[active])
    if (!term) return
    pushRecent(term)
    router.push(`/search?q=${encodeURIComponent(term)}`)
    onClose()
  }

  // Keep the highlighted row visible as the arrows walk past the fold.
  useEffect(() => {
    if (active < 0) return
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // Bound to the panel (not the input) so the arrows still work after Tab moves
  // focus into the result list.
  const onPanelKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      return onClose()
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hits.length) return
      e.preventDefault()
      const last = hits.length - 1
      setActive((i) => (e.key === 'ArrowDown' ? (i >= last ? -1 : i + 1) : i <= -1 ? last : i - 1))
      if (document.activeElement !== inputRef.current) inputRef.current?.focus()
      return
    }
    if (e.key !== 'Tab') return
    // Focus trap — a modal that leaks focus to the page behind it is a bug for
    // keyboard and screen-reader users alike.
    const focusable = panelRef.current?.querySelectorAll(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
    )
    const list = [...(focusable || [])].filter((n) => n.offsetParent !== null)
    if (list.length < 2) return
    const first = list[0]
    const last = list[list.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const dropRecent = (text) => {
    setRecent(removeRecent(text))
    inputRef.current?.focus()
  }

  const showSkeleton = searching && status === 'loading' && data.products.length === 0
  const showEmpty = searching && status === 'ready' && hits.length === 0
  const announcement = !searching
    ? ''
    : status === 'loading'
      ? 'Searching…'
      : status === 'error'
        ? 'Search is unavailable.'
        : `${data.total} result${data.total === 1 ? '' : 's'} for ${term}`

  let index = -1 // running flat index, mirrors `hits` order during render

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-start justify-center sm:p-6 sm:pt-[9vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div
        className="absolute inset-0 bg-as-ink/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search products"
        onKeyDown={onPanelKeyDown}
        initial={{ opacity: 0, y: -10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.985 }}
        transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
        className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-as-ink/10 sm:h-auto sm:max-h-[min(34rem,72vh)] sm:max-w-2xl sm:rounded-2xl"
      >
        {/* Query bar */}
        <form onSubmit={submit} className="flex items-center gap-3 border-b border-as-ink/10 px-4 py-3 sm:px-5">
          {status === 'loading' ? (
            <span
              className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-as-red/25 border-t-as-red"
              aria-hidden="true"
            />
          ) : (
            <Icon name="search" className="h-5 w-5 shrink-0 text-as-ink/35" />
          )}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="as-search-listbox"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-label="Search products"
            placeholder="Search products, brands and categories…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            enterKeyHint="search"
            className="h-8 min-w-0 flex-1 appearance-none bg-transparent text-base text-as-ink outline-none placeholder:text-as-ink/35 sm:text-[15px] [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
              className="rounded-full p-1 text-as-ink/35 transition-colors hover:bg-as-fog hover:text-as-ink"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="ml-1 hidden shrink-0 sm:inline-flex"
          >
            <span className="kbd">esc</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="-mr-1 shrink-0 rounded-full p-1.5 text-as-ink/50 transition-colors hover:bg-as-fog hover:text-as-ink sm:hidden"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </form>

        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        {/* Results */}
        <div
          id="as-search-listbox"
          role="listbox"
          aria-label="Search results"
          className="flex-1 overflow-y-auto overscroll-contain px-2 pb-3 sm:px-3"
        >
          {showSkeleton && (
            <div className="pt-2" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          )}

          {status === 'error' && searching && (
            <div className="px-4 py-14 text-center">
              <p className="text-sm text-as-ink/60">Search is unavailable right now.</p>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="mt-3 text-sm font-medium text-as-red hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {showEmpty && (
            <div className="px-4 py-12 text-center">
              <Icon name="search" className="mx-auto h-8 w-8 text-as-ink/15" />
              <p className="mt-3 text-[15px] font-medium text-as-ink">No results for “{term}”</p>
              <p className="mt-1 text-sm text-as-ink/45">
                Check the spelling, or try a broader word like the brand or category.
              </p>
              {popular.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {popular.map((c) => (
                    <Link
                      key={c.id}
                      href={`/category/${c.slug}`}
                      onClick={onClose}
                      className="rounded-full border border-as-ink/15 px-3 py-1.5 text-[13px] text-as-ink/70 transition-colors hover:border-as-red/40 hover:text-as-red"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {!searching && sections.length === 0 && (
            <p className="px-4 py-14 text-center text-sm text-as-ink/40">
              Start typing to search the store.
            </p>
          )}

          {sections.map((section) => (
            <div key={section.id} role="group" aria-labelledby={section.label ? `as-search-${section.id}` : undefined}>
              {section.label && (
                <div className="sticky top-0 z-10 flex items-center justify-between bg-white/95 px-3 pb-1.5 pt-3 backdrop-blur">
                  <span
                    id={`as-search-${section.id}`}
                    className="text-[11px] font-semibold uppercase tracking-wider text-as-ink/40"
                  >
                    {section.label}
                  </span>
                  {section.id === 'recent' && (
                    <button
                      type="button"
                      onClick={() => {
                        clearRecent()
                        setRecent([])
                      }}
                      className="text-[11px] font-medium text-as-ink/40 transition-colors hover:text-as-red"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
              {section.items.map((hit) => {
                index += 1
                const i = index
                const isActive = i === active
                const isAll = hit.kind === 'all'
                return (
                  <div key={hit.key} role="presentation" className="relative">
                    <Link
                      id={optionId(i)}
                      href={hit.href}
                      role="option"
                      aria-selected={isActive}
                      onMouseMove={() => setActive(i)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                        e.preventDefault()
                        go(hit)
                      }}
                      className={`flex scroll-mt-10 items-center gap-3 rounded-xl px-3 transition-colors ${
                        isAll
                          ? 'mt-2 justify-center border-t border-as-ink/10 py-3 text-[13px] font-medium text-as-red'
                          : 'py-2.5'
                      } ${isActive ? (isAll ? 'bg-as-red/5' : 'bg-as-fog') : ''}`}
                    >
                      {hit.kind === 'product' && <ProductRow product={hit.data} query={term} />}
                      {hit.kind === 'category' && (
                        <FacetRow item={hit.data} query={searching ? term : ''} icon="grid" />
                      )}
                      {hit.kind === 'brand' && <FacetRow item={hit.data} query={term} icon="tag" />}
                      {hit.kind === 'query' && (
                        <>
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-as-fog">
                            <Icon name="search" className="h-4 w-4 text-as-ink/35" />
                          </span>
                          <span className="min-w-0 flex-1 truncate pr-8 text-[14px] text-as-ink">
                            {hit.label}
                          </span>
                        </>
                      )}
                      {isAll && (
                        <>
                          {hit.label}
                          <Icon name="chevronRight" className="h-4 w-4" />
                        </>
                      )}
                      {/* Recent rows keep their right edge for the remove button. */}
                      {isActive && !isAll && hit.kind !== 'query' && (
                        <span className="kbd hidden sm:inline-flex" aria-hidden="true">
                          ↵
                        </span>
                      )}
                    </Link>
                    {hit.kind === 'query' && (
                      <button
                        type="button"
                        onClick={() => dropRecent(hit.label)}
                        aria-label={`Remove “${hit.label}” from recent searches`}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-as-ink/30 transition-colors hover:bg-white hover:text-as-red"
                      >
                        <Icon name="close" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Keyboard legend */}
        <div className="hidden items-center justify-between gap-4 border-t border-as-ink/10 bg-as-fog px-5 py-2.5 text-[11px] text-as-ink/45 sm:flex">
          <ul className="flex items-center gap-4">
            <li className="flex items-center gap-1.5">
              <span className="kbd">↵</span> to select
            </li>
            <li className="flex items-center gap-1.5">
              <span className="kbd">↑</span>
              <span className="kbd">↓</span> to navigate
            </li>
            <li className="flex items-center gap-1.5">
              <span className="kbd">esc</span> to close
            </li>
          </ul>
          <span className="font-medium text-as-ink/35">AS Store search</span>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ---- Public component -------------------------------------------------- */

// Algolia-style command palette for the storefront: grouped live results
// (products / categories / brands), query highlighting, recent searches,
// full keyboard control. Rendered in a portal so the fixed nav can't trap it in
// a stacking context; mounted once by Nav and driven by `open`.
export default function SearchDialog({ open, onClose, categories = [] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && <SearchPanel onClose={onClose} categories={categories} />}
    </AnimatePresence>,
    document.body,
  )
}
