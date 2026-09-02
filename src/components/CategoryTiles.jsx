import { optimizedImage } from '../lib/api'
import EventsLink from './EventsLink.jsx'

// Responsive grid of event-category tiles (image + label), like a box-office
// "browse by category" strip. Clicking a tile filters the Events page; the first
// "All events" tile clears the filter.
export default function CategoryTiles({ categories, activeSlug = '', includeAll = true }) {
  if (!categories?.length) return null

  const tiles = includeAll
    ? [{ id: '__all__', name: 'All events', slug: '', image: '' }, ...categories]
    : categories

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
      {tiles.map((c) => {
        const active = (c.slug || '') === (activeSlug || '')
        const isAll = c.id === '__all__'
        return (
          <EventsLink
            key={c.id}
            to={c.slug ? `?category=${c.slug}` : ''}
            className={`group relative h-24 overflow-hidden rounded-xl ring-1 transition sm:h-28 ${
              active ? 'ring-2 ring-as-red' : 'ring-black/5 hover:ring-as-red/40'
            }`}
          >
            {c.image ? (
              <img
                src={optimizedImage(c.image, { w: 480 })}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
            ) : (
              <div
                className={`absolute inset-0 ${
                  isAll ? 'bg-gradient-to-br from-as-red to-as-charcoal' : 'bg-as-charcoal'
                }`}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
            <span className="absolute inset-x-0 bottom-0 p-3 text-left text-sm font-bold uppercase tracking-wide text-white drop-shadow">
              {c.name}
            </span>
          </EventsLink>
        )
      })}
    </div>
  )
}
