import EventCard from '../components/EventCard.jsx'
import { useContent } from '../store/content.jsx'

export default function Events() {
  const { ticketing, events, eventsSection } = useContent()
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-extrabold tracking-tight text-as-charcoal sm:text-5xl">
            {eventsSection.heading}
          </h1>
          <p className="mt-4 text-base text-as-charcoal/60">
            {eventsSection.intro}
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm text-as-charcoal/55">
            <img src={ticketing.logo} alt={ticketing.name} className="h-6 w-auto" />
            {ticketing.note}
          </p>
        </div>

        {events.length === 0 ? (
          <p className="mt-16 text-center text-as-charcoal/50">
            No events scheduled right now — check back soon.
          </p>
        ) : (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
