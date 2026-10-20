import Link from 'next/link'

import { listingHref } from '@/lib/listing'
import FilterSelects from './FilterSelects'
import SourceDot from './SourceDot'

/**
 * The listing's two filters: what kind of event, and where it comes from.
 * Rows of chips from sm up; two dropdowns under "Filter by" on a phone, where
 * the rows would only fit by scrolling sideways (see FilterSelects).
 *
 * Each row carries the other's choice and the search on purpose: with a search
 * running, the tabs stop being navigation and become a way to narrow it
 * ("comedy, from Antoine, and the word I typed"). Dropping them would silently
 * throw the rest away on the tap meant to refine it.
 *
 * `sources` arrive with a `count` of what each would show under the current
 * category and search, so a tap is never a surprise. They don't disappear at
 * zero — the row would jump about as the category changes — they dim.
 */
export default function EventFilters({ categories = [], sources = [], category = '', source = '', query = '' }) {
  const categoryTabs = [{ slug: '', name: query ? 'All categories' : 'All events' }, ...categories]
  const total = sources.reduce((n, s) => n + s.count, 0)
  const sourceTabs = [{ slug: '', name: 'All sources', count: total }, ...sources]

  return (
    <>
      <div className="sm:hidden">
        <FilterSelects
          categoryTabs={categories.length ? categoryTabs : []}
          sourceTabs={sources.length ? sourceTabs : []}
          category={category}
          source={source}
          query={query}
        />
      </div>

      <div className="hidden space-y-3 sm:block">
        {categories.length ? (
          <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
            {categoryTabs.map((c) => {
              const on = c.slug === category
              return (
                <Link
                  key={c.slug || 'all'}
                  href={listingHref({ category: c.slug, source, q: query })}
                  aria-current={on ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                    on
                      ? 'bg-as-red text-white shadow-sm'
                      : 'bg-as-charcoal/[0.06] text-as-charcoal/75 hover:bg-as-charcoal/10'
                  }`}
                >
                  {c.name}
                </Link>
              )
            })}
          </nav>
        ) : null}

        {sources.length ? (
          <nav aria-label="Filter by source" className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-as-charcoal/45">
              Source
            </span>
            {sourceTabs.map((s) => {
              const on = s.slug === source
              return (
                <Link
                  key={s.slug || 'all'}
                  href={listingHref({ category, source: s.slug, q: query })}
                  aria-current={on ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 transition ${
                    on
                      ? 'bg-as-charcoal text-white ring-as-charcoal'
                      : `bg-white text-as-charcoal/75 ring-black/10 hover:ring-as-charcoal/30 ${
                          s.count ? '' : 'opacity-55'
                        }`
                  }`}
                >
                  {s.slug ? <SourceDot source={s} onDark={on} /> : null}
                  {s.name}
                  <span className={`tabular-nums ${on ? 'text-white/60' : 'text-as-charcoal/40'}`}>
                    {s.count}
                  </span>
                </Link>
              )
            })}
          </nav>
        ) : null}
      </div>
    </>
  )
}
