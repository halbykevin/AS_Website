'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from './Icon.jsx'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

// Search input → navigates to /search?q=. Reused in the nav overlay and on the
// search page itself. With `suggest`, typing shows a live dropdown of matching
// products (debounced) — click/Enter opens the product, or search everything.
export default function SearchBox({
  defaultValue = '',
  autoFocus = false,
  big = false,
  suggest = false,
  onSubmit,
  className = '',
}) {
  const router = useRouter()
  const [q, setQ] = useState(defaultValue)
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1) // highlighted suggestion (-1 = the input)
  const boxRef = useRef(null)

  const go = (href) => {
    router.push(href)
    setOpen(false)
    onSubmit?.()
  }

  const submit = (e) => {
    e?.preventDefault()
    const term = q.trim()
    if (!term) return
    go(`/search?q=${encodeURIComponent(term)}`)
  }

  // Debounced live suggestions (products whose name/brand/category match).
  useEffect(() => {
    if (!suggest) return
    const term = q.trim()
    if (term.length < 2) {
      setItems([])
      setOpen(false)
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/api/products?search=${encodeURIComponent(term)}&limit=6`, {
          signal: ctrl.signal,
        })
        if (!res.ok) return
        const data = await res.json()
        setItems(data)
        setOpen(true)
        setHi(-1)
      } catch {
        /* aborted or offline — keep whatever is shown */
      }
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, suggest])

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const onKeyDown = (e) => {
    if (!open || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHi((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((i) => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === 'Enter' && hi >= 0) {
      e.preventDefault()
      const p = items[hi]
      if (p?.slug) go(`/product/${p.slug}`)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <form
        onSubmit={submit}
        className={`flex items-center gap-2 rounded-full border border-as-ink/15 bg-white px-4 ${big ? 'h-12' : 'h-10'}`}
      >
        <Icon name="search" className="h-5 w-5 shrink-0 text-as-ink/40" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggest && items.length > 0 && setOpen(true)}
          autoFocus={autoFocus}
          placeholder="Search products…"
          aria-label="Search products"
          aria-expanded={open}
          autoComplete="off"
          className="w-full flex-1 bg-transparent text-[15px] text-as-ink outline-none placeholder:text-as-ink/40"
        />
      </form>

      {suggest && open && items.length > 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-as-ink/10 bg-white shadow-xl">
          <ul>
            {items.map((p, i) => {
              const price = Number(p.price) || 0
              const oldPrice = p.oldPrice ? Number(p.oldPrice) : null
              const onSale = Boolean(oldPrice) && oldPrice > price
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => p.slug && go(`/product/${p.slug}`)}
                    onMouseEnter={() => setHi(i)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                      i === hi ? 'bg-as-fog' : ''
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-as-ink/10">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="h-full w-full object-contain p-1" />
                      ) : (
                        <Icon name="box" className="h-5 w-5 text-as-ink/30" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-medium text-as-ink">{p.name}</span>
                      {p.brand && <span className="text-xs text-as-ink/45">{p.brand}</span>}
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className={onSale ? 'font-semibold text-as-red' : 'text-as-ink'}>
                        ${price.toLocaleString()}
                      </span>
                      {onSale && (
                        <span className="ml-1.5 text-xs text-as-ink/40 line-through">
                          ${oldPrice.toLocaleString()}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            onClick={submit}
            className="flex w-full items-center justify-center gap-1.5 border-t border-as-ink/10 px-4 py-3 text-sm font-medium text-as-red hover:bg-as-fog"
          >
            See all results for “{q.trim()}”
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
