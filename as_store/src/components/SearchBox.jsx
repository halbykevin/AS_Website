'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from './Icon.jsx'

// Search input → navigates to /search?q=. Reused in the nav overlay and on the
// search page itself.
export default function SearchBox({ defaultValue = '', autoFocus = false, big = false, onSubmit, className = '' }) {
  const router = useRouter()
  const [q, setQ] = useState(defaultValue)

  const submit = (e) => {
    e.preventDefault()
    const term = q.trim()
    if (!term) return
    router.push(`/search?q=${encodeURIComponent(term)}`)
    onSubmit?.()
  }

  return (
    <form
      onSubmit={submit}
      className={`flex items-center gap-2 rounded-full border border-as-ink/15 bg-white px-4 ${big ? 'h-12' : 'h-10'} ${className}`}
    >
      <Icon name="search" className="h-5 w-5 shrink-0 text-as-ink/40" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder="Search products…"
        aria-label="Search products"
        className="w-full flex-1 bg-transparent text-[15px] text-as-ink outline-none placeholder:text-as-ink/40"
      />
    </form>
  )
}
