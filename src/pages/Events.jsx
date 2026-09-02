import { useSearchParams } from 'react-router-dom'
import EventCard from '../components/EventCard.jsx'
import CategoryTiles from '../components/CategoryTiles.jsx'
import Reveal from '../components/Reveal.jsx'
import { useContent } from '../store/content.jsx'

export default function Events() {
  const { events, eventsSection, categories } = useContent()
  const [params] = useSearchParams()
  const activeSlug = params.get('category') || ''
  const activeCategory = categories.find((c) => c.slug === activeSlug)

  const filtered = activeSlug ? events.filter((e) => e.categorySlug === activeSlug) : events

  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-extrabold tracking-tight text-as-charcoal sm:text-5xl">
            {activeCategory ? activeCategory.name : eventsSection.heading}
          </h1>
          <p className="mt-4 text-base text-as-charcoal/60">{eventsSection.intro}</p>
        </div>

        {categories.length > 0 && (
          <div className="mt-10">
            <CategoryTiles categories={categories} activeSlug={activeSlug} />
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="mt-16 text-center text-as-charcoal/50">
            {activeCategory
              ? `No events in “${activeCategory.name}” right now — check back soon.`
              : 'No events scheduled right now — check back soon.'}
          </p>
        ) : (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((event, i) => (
              <Reveal key={event.id} delay={(i % 3) * 80}>
                <EventCard event={event} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
