'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from './Icon.jsx'
import { normalizeQuery, pushRecent } from '@/lib/search'

// Inline search field → navigates to /search?q=. Used where a persistent field
// beats the ⌘K palette (the search page's own header). Live suggestions live in
// components/search/SearchDialog.jsx so there is one autocomplete, not two.
export default function SearchBox({
  defaultValue = '',
  autoFocus = false,
  big = false,
  placeholder = 'Search products, brands and categories…',
  onSubmit,
  className = '',
}) {
  const router = useRouter()
  const [q, setQ] = useState(defaultValue)
  const inputRef = useRef(null)

  // Keep the field in step with the URL (back/forward, or a new query from the
  // dialog while this page is mounted).
  useEffect(() => setQ(defaultValue), [defaultValue])

  const submit = (e) => {
    e?.preventDefault()
    const term = normalizeQuery(q)
    if (!term) return inputRef.current?.focus()
    pushRecent(term)
    router.push(`/search?q=${encodeURIComponent(term)}`)
    inputRef.current?.blur()
    onSubmit?.(term)
  }

  const clear = () => {
    setQ('')
    inputRef.current?.focus()
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      className={`flex items-center gap-2 rounded-full border border-as-ink/15 bg-white px-4 transition focus-within:border-as-red/45 focus-within:ring-4 focus-within:ring-as-red/10 ${
        big ? 'h-12' : 'h-10'
      } ${className}`}
    >
      <Icon name="search" className="h-5 w-5 shrink-0 text-as-ink/35" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="Search products"
        autoComplete="off"
        enterKeyHint="search"
        className="min-w-0 flex-1 appearance-none bg-transparent text-base text-as-ink outline-none placeholder:text-as-ink/35 sm:text-[15px] [&::-webkit-search-cancel-button]:hidden"
      />
      {q && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="rounded-full p-1 text-as-ink/35 transition-colors hover:bg-as-fog hover:text-as-ink"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      )}
      <button
        type="submit"
        aria-label="Search"
        className={`-mr-3 shrink-0 rounded-full bg-as-red px-4 text-sm font-medium text-white transition hover:bg-as-red-light active:scale-[.98] disabled:opacity-40 ${
          big ? 'h-10' : 'h-8'
        }`}
        disabled={!normalizeQuery(q)}
      >
        Search
      </button>
    </form>
  )
}
