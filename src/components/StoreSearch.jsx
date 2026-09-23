import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { useContent } from '../store/content.jsx'
import {
  EMPTY_RESULT,
  MIN_QUERY,
  cachedSuggestions,
  clearRecent,
  fetchPopularCategories,
  fetchSuggestions,
  normalizeQuery,
  pushRecent,
  queryTokens,
  readRecent,
  storeLinks,
} from '../lib/storeSearch.js'

// The AS Store's search, on the homepage — the website's twin of the app's
// home-screen search (mobile/src/components/home/HomeSearch.jsx): the same box,
// the same idle panel (recent searches + departments), the same suggestions as
// you type from the same /api/search/suggest, the same highlighting of the
// words typed. Every result opens on the store, in a new tab like every other
// store link on this site.
//
// Two deliberate differences from the app:
//  • No prices. This site never quotes one (see StoreBanner.jsx) — the store
//    does, one tap away. The API relay drops them before they reach here.
//  • A brand opens the store's brand filter (/shop?brand=), which the website
//    has and the app doesn't.
//
// Web-only behaviour: arrow keys walk the results, Enter opens the highlighted
// one (or searches), Escape closes, and a click anywhere else closes. It does
// not close on blur — on a phone the tap that blurs the field is usually the
// tap on a result, and closing first would pull the row out from under it.

const DEBOUNCE_MS = 180 // the app's and the store dialog's: one request per word, not per letter
const LIMIT = 6

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Marks the typed words inside a result, longest first so "wheel" wins over
// "whe". Weight and colour only — a match that changed size would reflow the
// row as you type.
function Highlight({ text, query }) {
  const value = String(text ?? '')
  const tokens = queryTokens(query)
  if (!value || !tokens.length) return value
  const re = new RegExp(`(${[...tokens].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})`, 'gi')
  // split() with a capture group interleaves plain text and matches.
  return value.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-transparent font-semibold text-as-red">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

// A value that lags `ms` behind — the box stays instant, only the request waits.
function useDebounced(value, ms) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

function Thumb({ src, icon }) {
  const [broken, setBroken] = useState(false)
  // Product photography is shot on white, so the tile behind it is white too.
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/[0.06] bg-white">
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-contain p-1" />
      ) : (
        <Icon name={icon} className="h-5 w-5 text-as-charcoal/30" />
      )}
    </span>
  )
}

function SectionLabel({ children, action }) {
  return (
    <div className="flex items-center justify-between px-2 pb-1 pt-3 first:pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-as-charcoal/40">{children}</span>
      {action}
    </div>
  )
}

const countLabel = (n) => (n > 0 ? `${n} product${n === 1 ? '' : 's'}` : '')

export default function StoreSearch({ className = '' }) {
  const { store } = useContent()
  const base = store?.url || ''
  const links = useMemo(() => storeLinks(base), [base])

  const uid = useId()
  const listId = `${uid}-list`
  const optId = (i) => `${uid}-opt-${i}`
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [recent, setRecent] = useState([])
  const [popular, setPopular] = useState([])
  const [result, setResult] = useState(EMPTY_RESULT)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const term = normalizeQuery(q)
  const debounced = useDebounced(term, DEBOUNCE_MS)
  const searching = term.length >= MIN_QUERY

  // An answer already in the session cache paints the moment it's typed.
  useEffect(() => {
    const hit = cachedSuggestions(term)
    if (hit) setResult(hit)
    setActive(-1)
  }, [term])

  useEffect(() => {
    if (debounced.length < MIN_QUERY) {
      setLoading(false)
      setFailed(false)
      return undefined
    }
    const ctrl = new AbortController()
    setLoading(true)
    setFailed(false)
    fetchSuggestions(debounced, { signal: ctrl.signal, limit: LIMIT })
      .then((r) => {
        setResult(r)
        setLoading(false)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setFailed(true)
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [debounced, attempt])

  // Still catching up — in flight, or the debounce hasn't released the latest
  // keystroke. The previous results stay up underneath rather than blanking.
  const settling = searching && (loading || debounced !== term)
  const shown = searching ? result : EMPTY_RESULT
  const hasResults = shown.products.length + shown.categories.length + shown.brands.length > 0

  // Recents and departments are read when the panel opens, not on page load:
  // most visitors never touch the box and shouldn't pay for it.
  const openPanel = () => {
    if (open) return
    setOpen(true)
    setRecent(readRecent())
    fetchPopularCategories().then(setPopular)
  }

  const closePanel = useCallback(() => {
    setOpen(false)
    setActive(-1)
  }, [])

  // Cancel, and after a result has been opened: the app's two ways out.
  const reset = useCallback(() => {
    closePanel()
    setQ('')
    inputRef.current?.blur()
  }, [closePanel])

  // A press anywhere outside closes the panel but keeps what was typed.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) closePanel()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, closePanel])

  const remember = (text) => {
    if (normalizeQuery(text)) setRecent(pushRecent(text))
  }

  /* ---- Every selectable row, in order, so the keyboard can walk them ------ */

  const hits = []
  const add = (hit) => {
    hits.push(hit)
    return hits.length - 1
  }

  const sections = []
  if (open) {
    if (!searching) {
      if (recent.length) {
        sections.push({
          key: 'recent',
          label: 'Recent searches',
          action: (
            <button
              type="button"
              onClick={() => setRecent(clearRecent())}
              className="text-xs text-as-charcoal/40 transition hover:text-as-red"
            >
              Clear
            </button>
          ),
          rows: recent.map((text) => ({
            i: add({ href: links.search(text), text }),
            icon: 'history',
            title: text,
            trail: 'arrow',
          })),
        })
      }
      if (popular.length) {
        sections.push({
          key: 'popular',
          label: 'Browse categories',
          rows: popular.map((c) => ({
            i: add({ href: links.category(c) }),
            image: c.image,
            icon: 'grid',
            title: c.name,
          })),
        })
      }
    } else if (hasResults && !failed) {
      sections.push({
        key: 'products',
        rows: shown.products.map((p) => ({
          i: add({ href: links.product(p, term), text: term }),
          image: p.image,
          icon: 'store',
          title: p.name,
          meta: [p.brand, p.category].filter(Boolean).join(' · '),
        })),
      })
      if (shown.categories.length) {
        sections.push({
          key: 'categories',
          label: 'Categories',
          rows: shown.categories.map((c) => ({
            i: add({ href: links.category(c), text: term }),
            image: c.image,
            icon: 'grid',
            title: c.name,
            sub: countLabel(c.productCount),
          })),
        })
      }
      if (shown.brands.length) {
        sections.push({
          key: 'brands',
          label: 'Brands',
          rows: shown.brands.map((b) => ({
            i: add({ href: links.brand(b), text: b.name }),
            image: b.image,
            icon: 'tag',
            title: b.name,
            sub: countLabel(b.productCount),
          })),
        })
      }
      sections.push({
        key: 'all',
        rows: [
          {
            i: add({ href: links.search(term), text: term }),
            seeAll: true,
            title: `See all ${shown.total} result${shown.total === 1 ? '' : 's'}`,
          },
        ],
      })
    }
  }
  // Chips under "no results" are hits too, so they can be reached by keyboard.
  const noResults = open && searching && !failed && !hasResults && !settling
  const chips = noResults ? popular.map((c) => ({ c, i: add({ href: links.category(c), text: term }) })) : []

  useEffect(() => {
    if (active >= 0) document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' })
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Opening a result -------------------------------------------------- */

  // A click follows the link itself (so ⌘/Ctrl-click and middle-click behave
  // like any link); the panel is folded a tick later so the row still exists
  // while the browser acts on it.
  const onPick = (hit) => {
    if (hit.text) remember(hit.text)
    setTimeout(reset, 0)
  }

  // Enter, from the keyboard: the highlighted row, or a search for what's typed.
  const onSubmit = (e) => {
    e.preventDefault()
    const hit = active >= 0 ? hits[active] : term ? { href: links.search(term), text: term } : null
    if (!hit) return
    window.open(hit.href, '_blank', 'noopener,noreferrer')
    onPick(hit)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      openPanel()
      setActive((i) => Math.min(i + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      if (open) closePanel()
      else if (q) setQ('')
    }
  }

  // Nowhere to send anyone until the store's address is set in Site Settings.
  if (!/^https?:\/\//i.test(base)) return null

  const rowCls = (i) =>
    `flex items-center gap-3 rounded-2xl px-2 py-2 text-left transition ${
      i === active ? 'bg-as-charcoal/[0.06]' : 'hover:bg-as-charcoal/[0.04]'
    }`

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <form role="search" onSubmit={onSubmit} className="flex items-center gap-3">
        <div className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-black/10 bg-as-charcoal/[0.03] px-4 transition focus-within:border-as-red/50 focus-within:bg-white focus-within:shadow-[0_10px_30px_-14px_rgba(164,30,34,0.45)]">
          {settling ? (
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-as-red/25 border-t-as-red" aria-hidden />
          ) : (
            <Icon name="search" className="h-5 w-5 shrink-0 text-as-charcoal/40" />
          )}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              openPanel()
            }}
            onFocus={openPanel}
            onKeyDown={onKeyDown}
            // 16px, not 15: iOS zooms the whole page into any smaller field.
            className="min-w-0 flex-1 bg-transparent text-base text-as-charcoal outline-none placeholder:text-as-charcoal/40"
            placeholder="Search products, brands…"
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            role="combobox"
            aria-label="Search the AS Store"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? optId(active) : undefined}
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQ('')
                inputRef.current?.focus()
              }}
              className="-mr-1 rounded-full p-1 text-as-charcoal/40 transition hover:text-as-charcoal"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>
        {open && (
          <button type="button" onClick={reset} className="shrink-0 text-sm font-semibold text-as-red transition hover:text-as-red-dark">
            Cancel
          </button>
        )}
      </form>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          // Lenis smooth-scrolls the page by taking over the wheel; this lets
          // the list scroll itself instead of the page behind it.
          data-lenis-prevent
          className="absolute inset-x-0 top-full z-40 mt-2 max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain rounded-3xl bg-white p-2 shadow-2xl shadow-black/15 ring-1 ring-black/[0.06]"
        >
          {searching && failed ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-as-charcoal/60">Search is unavailable right now.</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 text-sm font-semibold text-as-red hover:underline">
                Try again
              </button>
            </div>
          ) : searching && !hasResults && settling ? (
            [0, 1, 2].map((k) => (
              <div key={k} className="flex items-center gap-3 px-2 py-2" aria-hidden>
                <span className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-as-charcoal/[0.06]" />
                <span className="flex-1 space-y-2">
                  <span className="block h-2.5 w-2/3 animate-pulse rounded bg-as-charcoal/[0.06]" />
                  <span className="block h-2 w-1/3 animate-pulse rounded bg-as-charcoal/[0.06]" />
                </span>
              </div>
            ))
          ) : noResults ? (
            <div className="px-4 py-8 text-center">
              <Icon name="search" className="mx-auto h-7 w-7 text-as-charcoal/25" />
              <p className="mt-2 text-sm font-medium text-as-charcoal">No results for “{term}”</p>
              <p className="mt-1 text-xs text-as-charcoal/45">Check the spelling, or try a broader word like the brand or category.</p>
              {chips.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {chips.map(({ c, i }) => (
                    <a
                      key={c.id}
                      id={optId(i)}
                      role="option"
                      aria-selected={i === active}
                      href={hits[i].href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => onPick(hits[i])}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        i === active ? 'border-as-red text-as-red' : 'border-black/10 text-as-charcoal/60 hover:border-as-red/40 hover:text-as-red'
                      }`}
                    >
                      {c.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : sections.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-as-charcoal/45">Start typing to search the store.</p>
          ) : (
            sections.map((s) => (
              <div key={s.key}>
                {s.label && <SectionLabel action={s.action}>{s.label}</SectionLabel>}
                {s.rows.map((r) => (
                  <a
                    key={r.i}
                    id={optId(r.i)}
                    role="option"
                    aria-selected={r.i === active}
                    href={hits[r.i].href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => onPick(hits[r.i])}
                    onMouseMove={() => active !== r.i && setActive(r.i)}
                    className={rowCls(r.i)}
                  >
                    {r.seeAll ? (
                      <>
                        <span className="min-w-0 flex-1 px-1 py-1 text-sm font-semibold text-as-red">{r.title}</span>
                        <Icon name="arrow" className="h-4 w-4 shrink-0 text-as-red" />
                      </>
                    ) : (
                      <>
                        {r.image !== undefined ? (
                          <Thumb src={r.image} icon={r.icon} />
                        ) : (
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                            <Icon name={r.icon} className="h-5 w-5 text-as-charcoal/35" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-as-charcoal">
                            <Highlight text={r.title} query={shown.query} />
                          </span>
                          {r.meta && (
                            <span className="mt-0.5 block truncate text-xs text-as-charcoal/50">
                              <Highlight text={r.meta} query={shown.query} />
                            </span>
                          )}
                          {r.sub && <span className="mt-0.5 block text-xs text-as-charcoal/40">{r.sub}</span>}
                        </span>
                        <Icon name={r.trail === 'arrow' ? 'arrow' : 'chevron'} className="h-4 w-4 shrink-0 text-as-charcoal/30" />
                      </>
                    )}
                  </a>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
