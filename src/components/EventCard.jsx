import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'

const statusStyles = {
  open: { label: 'Reserve now', className: 'bg-green-50 text-green-700 ring-green-600/20' },
  'sold-out': { label: 'Sold out', className: 'bg-as-gray/20 text-as-charcoal/60 ring-black/10' },
  'coming-soon': { label: 'Coming soon', className: 'bg-as-red/5 text-as-red ring-as-red/20' },
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function EventCard({ event }) {
  const status = statusStyles[event.status] ?? statusStyles.open
  const cardCls =
    'group flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg'

  const body = (
    <>
      <div className="relative aspect-[16/10] overflow-hidden bg-as-gray/10">
        <img
          src={event.image}
          alt={event.title}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${status.className}`}>
          {status.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold text-as-charcoal transition group-hover:text-as-red">
          {event.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-as-charcoal/60">{event.excerpt}</p>

        <div className="mt-4 space-y-1.5 text-sm text-as-charcoal/70">
          <p className="flex items-center gap-2">
            <Icon name="calendar" className="h-4 w-4 text-as-red" />
            {formatDate(event.date)}{event.time ? ` · ${event.time}` : ''}
            {event.dates?.length > 1 && (
              <span className="rounded-full bg-as-red/10 px-2 py-0.5 text-xs font-semibold text-as-red">
                +{event.dates.length - 1} more {event.dates.length - 1 === 1 ? 'date' : 'dates'}
              </span>
            )}
          </p>
          <p className="flex items-center gap-2">
            <Icon name="pin" className="h-4 w-4 text-as-red" />
            {[event.venue, event.city].filter(Boolean).join(', ')}
          </p>
        </div>

        <div className="mt-5 flex items-center justify-end border-t border-black/5 pt-4">
          <span className="flex items-center gap-1 text-sm font-semibold text-as-red">
            {event.bookingUrl ? 'Reserve now' : 'Details'}
            <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </>
  )

  // With a reserve link (WhatsApp when configured, else the ticket URL) the
  // whole card opens it; otherwise go to the detail page.
  if (event.bookingUrl) {
    return (
      <a href={event.bookingUrl} target="_blank" rel="noreferrer" className={cardCls}>
        {body}
      </a>
    )
  }
  return (
    <Link to={`/events/${event.id}`} className={cardCls}>
      {body}
    </Link>
  )
}
