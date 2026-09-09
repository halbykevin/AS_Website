import Link from 'next/link'

/**
 * `query` is carried across the tabs on purpose: with a search running, the
 * tabs stop being navigation and become a way to narrow it ("comedy, and the
 * word I typed"). Dropping it would silently throw the search away on the tap
 * meant to refine it. Without a search the hrefs are exactly the canonical
 * /events?category=<slug> URLs the sitemap lists.
 */
export default function CategoryFilter({ categories, active = '', query = '' }) {
  if (!categories?.length) return null
  const tabs = [{ slug: '', name: query ? 'All categories' : 'All events' }, ...categories]

  const hrefFor = (slug) => {
    const parts = []
    if (slug) parts.push(`category=${encodeURIComponent(slug)}`)
    if (query) parts.push(`q=${encodeURIComponent(query)}`)
    return parts.length ? `/events?${parts.join('&')}` : '/events'
  }

  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <div className="flex w-max gap-2 pb-1 sm:w-auto sm:flex-wrap">
        {tabs.map((c) => {
          const on = c.slug === active
          return (
            <Link
              key={c.slug || 'all'}
              href={hrefFor(c.slug)}
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
      </div>
    </div>
  )
}
