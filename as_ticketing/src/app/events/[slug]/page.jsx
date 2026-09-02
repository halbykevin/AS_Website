import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getEvent, getEvents, getSettings } from '@/lib/api'
import { bookingUrl, eventDateLabel, formatDate } from '@/lib/events'
import EventCard from '@/components/EventCard'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) return { title: 'Event not found' }
  return {
    title: event.title,
    description: event.excerpt || `${eventDateLabel(event)} · ${event.venue || 'Lebanon'}`,
    alternates: { canonical: `/events/${event.slug}` },
    openGraph: {
      title: event.title,
      description: event.excerpt || '',
      images: event.imageUrl ? [event.imageUrl] : undefined,
    },
  }
}

export default async function EventPage({ params }) {
  const { slug } = await params
  const [event, settings, all] = await Promise.all([getEvent(slug), getSettings(), getEvents()])
  if (!event) notFound()

  const reserve = bookingUrl(event, settings.whatsappNumber)
  const viaWhatsApp = reserve.startsWith('https://wa.me/')
  const nights = (event.dates || []).filter((d) => d.date)
  const similar = all
    .filter((e) => e.slug !== event.slug && e.categorySlug === event.categorySlug)
    .slice(0, 3)

  return (
    <article>
      <div className="relative h-64 w-full overflow-hidden bg-as-ink sm:h-80 lg:h-[26rem]">
        {event.imageUrl ? (
          <Image src={event.imageUrl} alt={event.title} fill priority sizes="100vw" className="object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-5xl px-5 pb-6 sm:px-8">
          <Link href="/events" className="inline-flex items-center gap-1.5 text-sm font-medium text-white/75 transition hover:text-white">
            <svg className="h-4 w-4 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            All events
          </Link>
          {event.categoryName ? (
            <p className="mt-3 inline-block rounded-full bg-as-red px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              {event.categoryName}
            </p>
          ) : null}
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {event.title}
          </h1>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Date" value={eventDateLabel(event)} />
            <Info label="Time" value={event.time} />
            <Info label="Venue" value={event.venue} />
            <Info label="City" value={event.city} />
          </div>

          {/* A run's individual nights, each with its own booking link — the one
              thing a single date on the card cannot convey. */}
          {nights.length > 1 && (
            <div className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-as-charcoal/50">
                All {nights.length} nights
              </h2>
              <ul className="mt-3 divide-y divide-black/5 overflow-hidden rounded-xl ring-1 ring-black/5">
                {nights.map((d, i) => (
                  <li key={`${d.date}-${i}`} className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-3">
                    <span className="text-sm font-medium text-as-charcoal">
                      {formatDate(d.date)}
                      {d.time ? <span className="text-as-charcoal/50"> · {d.time}</span> : null}
                      {d.venue ? <span className="text-as-charcoal/50"> · {d.venue}</span> : null}
                    </span>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-as-red transition hover:text-as-red-light">
                        Tickets →
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {event.description ? (
            <div className="mt-8 whitespace-pre-line text-[15px] leading-relaxed text-as-charcoal/75">
              {event.description}
            </div>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <p className="text-xs font-semibold uppercase tracking-wider text-as-charcoal/45">Reserve</p>
            <p className="mt-1 text-lg font-bold text-as-charcoal">{eventDateLabel(event)}</p>
            {event.venue ? <p className="mt-0.5 text-sm text-as-charcoal/55">{event.venue}</p> : null}
            {reserve ? (
              <a
                href={reserve}
                target="_blank"
                rel="noreferrer"
                className="mt-5 block rounded-full bg-as-red px-6 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light"
              >
                {viaWhatsApp ? 'Reserve on WhatsApp' : 'Get tickets'}
              </a>
            ) : (
              <p className="mt-5 rounded-xl bg-as-gray/10 px-4 py-4 text-center text-sm text-as-charcoal/60">
                Contact us to reserve your spot.
              </p>
            )}
          </div>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 pb-4 sm:px-8">
          <h2 className="text-lg font-extrabold text-as-charcoal">More {event.categoryName}</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        </section>
      )}
    </article>
  )
}

function Info({ label, value }) {
  if (!value) return null
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
      <p className="text-xs font-semibold uppercase tracking-wider text-as-charcoal/45">{label}</p>
      <p className="mt-1 text-sm font-medium text-as-charcoal">{value}</p>
    </div>
  )
}
