import Link from 'next/link'

export default function CategoryFilter({ categories, active = '' }) {
  if (!categories?.length) return null
  const tabs = [{ slug: '', name: 'All events' }, ...categories]

  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <div className="flex w-max gap-2 pb-1 sm:w-auto sm:flex-wrap">
        {tabs.map((c) => {
          const on = c.slug === active
          return (
            <Link
              key={c.slug || 'all'}
              href={c.slug ? `/events?category=${c.slug}` : '/events'}
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
