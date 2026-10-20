'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { listingHref } from '@/lib/listing'

/**
 * The listing's filters on a phone: two dropdowns under "Filter by" instead of
 * two rows of chips. At phone width those rows only fit by scrolling sideways,
 * cut off at the edge, and the chip you're on is often out of sight — a select
 * shows the current choice and opens the phone's own picker for the rest.
 *
 * It is a real GET form, so without JavaScript the <noscript> button applies
 * it; with JavaScript a change navigates at once and keeps the scroll position,
 * so the grid updates under your thumb instead of jumping back to the hero.
 */
export default function FilterSelects({ categoryTabs = [], sourceTabs = [], category = '', source = '', query = '' }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const go = (next) =>
    startTransition(() => {
      router.push(listingHref({ category, source, q: query, ...next }), { scroll: false })
    })

  return (
    <form action="/events" method="get" className={`transition-opacity ${pending ? 'opacity-60' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-as-charcoal/45">Filter by</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {categoryTabs.length > 1 ? (
          <Select
            label="Category"
            name="category"
            value={category}
            onChange={(slug) => go({ category: slug })}
            options={categoryTabs.map((c) => ({ value: c.slug, label: c.name }))}
          />
        ) : null}
        {sourceTabs.length > 1 ? (
          <Select
            label="Source"
            name="source"
            value={source}
            onChange={(slug) => go({ source: slug })}
            // No count on "All sources": it is the closed box's usual face, and
            // half a box wide the number only pushes the name into an ellipsis.
            options={sourceTabs.map((s) => ({ value: s.slug, label: s.slug ? `${s.name} (${s.count})` : s.name }))}
          />
        ) : null}
      </div>
      {query ? <input type="hidden" name="q" value={query} /> : null}
      <noscript>
        <button
          type="submit"
          className="mt-2 w-full rounded-full bg-as-red px-4 py-2 text-sm font-semibold text-white"
        >
          Apply
        </button>
      </noscript>
    </form>
  )
}

function Select({ label, name, value, onChange, options }) {
  const on = Boolean(value)
  return (
    <label
      className={`relative block min-w-0 rounded-xl bg-white ring-1 transition focus-within:ring-2 focus-within:ring-as-red/40 ${
        on ? 'ring-as-red/50' : 'ring-black/10'
      }`}
    >
      <span className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wider text-as-charcoal/45">
        {label}
      </span>
      {/* Uncontrolled, and re-keyed by the URL's value: a controlled select
          would snap back to the old choice while the new page loads. */}
      <select
        key={value}
        name={name}
        defaultValue={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full cursor-pointer appearance-none truncate rounded-xl bg-transparent pb-2 pl-3 pr-8 pt-5 text-sm font-semibold outline-none ${
          on ? 'text-as-red' : 'text-as-charcoal'
        }`}
      >
        {options.map((o) => (
          <option key={o.value || 'all'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-as-charcoal/45"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  )
}
