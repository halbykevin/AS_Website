import Image from 'next/image'
import Link from 'next/link'
import { eventDateLabel, eventDays } from '@/lib/events'

export default function EventCard({ event, priority = false }) {
  const days = eventDays(event)
  const nights = days.length

  return (
    <Link
      href={`/events/${event.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-lg hover:ring-as-red/25"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-as-ink">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            priority={priority}
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : null}
        {event.categoryName ? (
          <span className="absolute left-3 top-3 rounded-full bg-as-red px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
            {event.categoryName}
          </span>
        ) : null}
        {/* A run is the thing a single date would misrepresent, so say it up front. */}
        {nights > 1 ? (
          <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
            {nights} nights
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-as-red">
          {eventDateLabel(event)}
        </p>
        <h3 className="mt-1.5 line-clamp-2 text-base font-bold leading-snug text-as-charcoal">
          {event.title}
        </h3>
        {(event.venue || event.city) && (
          <p className="mt-1.5 line-clamp-1 text-sm text-as-charcoal/55">
            {[event.venue, event.city].filter(Boolean).join(', ')}
          </p>
        )}
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-as-red">
          Details
          <svg className="h-4 w-4 transition group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </div>
    </Link>
  )
}
