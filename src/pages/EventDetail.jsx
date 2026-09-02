import { Link, useParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { formatDate } from '../components/EventCard.jsx'
import { useContent } from '../store/content.jsx'

export default function EventDetail() {
  const { id } = useParams()
  const { getEvent } = useContent()
  const event = getEvent(id)

  if (!event) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8">
        <h1 className="text-3xl font-extrabold text-as-charcoal">Event not found</h1>
        <p className="mt-4 text-as-charcoal/60">
          This event may have ended or moved.
        </p>
        <Link
          to="/events"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-as-red px-6 py-3 text-sm font-semibold text-white transition hover:bg-as-red-light"
        >
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          Back to events
        </Link>
      </section>
    )
  }

  return (
    <article>
      {/* Hero image */}
      <div className="relative h-64 w-full overflow-hidden bg-as-gray/10 sm:h-80 lg:h-96">
        <img src={event.image} alt={event.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-5xl px-5 pb-6 sm:px-8">
          <Link
            to="/events"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/80 transition hover:text-white"
          >
            <Icon name="arrow" className="h-4 w-4 rotate-180" />
            All events
          </Link>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {event.title}
          </h1>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-3">
        {/* Details */}
        <div className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <InfoCard
              icon="calendar"
              label="Date"
              value={event.dates?.length > 1 ? `${event.dates.length} dates` : formatDate(event.date)}
            />
            <InfoCard icon="clock" label="Time" value={event.time} />
            <InfoCard icon="pin" label="Venue" value={[event.venue, event.city].filter(Boolean).join(', ')} />
          </div>

          {event.dates?.length > 1 && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-as-charcoal">All dates</h2>
              <ul className="mt-3 divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white">
                {event.dates.map((d, i) => (
                  <li key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-as-charcoal">
                        {formatDate(d.date)}{d.time ? ` · ${d.time}` : ''}
                      </p>
                      {(d.label || d.venue) && (
                        <p className="truncate text-xs text-as-charcoal/55">
                          {[d.label, d.venue].filter(Boolean).join(' — ')}
                        </p>
                      )}
                    </div>
                    {d.url && (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-full bg-as-red px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-as-red-light"
                      >
                        Book
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h2 className="mt-10 text-xl font-bold text-as-charcoal">About this event</h2>
          <p className="mt-3 leading-relaxed text-as-charcoal/70">{event.description}</p>
        </div>

        {/* Reserve panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            {event.status !== 'open' ? (
              <div className="rounded-xl bg-as-gray/10 px-4 py-5 text-center text-sm font-medium text-as-charcoal/60">
                {event.status === 'sold-out'
                  ? 'This event is sold out.'
                  : 'Reservations open soon — check back shortly.'}
              </div>
            ) : event.bookingUrl ? (
              <a
                href={event.bookingUrl}
                target="_blank"
                rel="noreferrer"
                className="block w-full rounded-full bg-as-red px-6 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light hover:shadow-md"
              >
                Reserve now
              </a>
            ) : (
              <div className="rounded-xl bg-as-gray/10 px-4 py-5 text-center text-sm font-medium text-as-charcoal/60">
                Contact us to reserve your spot.
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function InfoCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-as-red">
        <Icon name={icon} className="h-5 w-5" />
        <span className="text-xs font-semibold uppercase tracking-wider text-as-charcoal/50">
          {label}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-as-charcoal">{value}</p>
    </div>
  )
}

