import { getCategories, getEvents } from '@/lib/api'
import EventCard from '@/components/EventCard'
import CategoryFilter from '@/components/CategoryFilter'

export const metadata = {
  title: 'What’s on in Lebanon',
  description:
    'Every upcoming concert, comedy night, play, festival and party across Lebanon — in one place.',
}

export default async function EventsPage({ searchParams }) {
  const params = await searchParams
  const active = typeof params?.category === 'string' ? params.category : ''

  const [events, categories] = await Promise.all([getEvents(), getCategories()])
  const shown = active ? events.filter((e) => e.categorySlug === active) : events
  const activeName = categories.find((c) => c.slug === active)?.name

  return (
    <>
      <section className="bg-as-ink">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {activeName || 'What’s on'}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/60">
            Concerts, comedy, theatre, festivals and nights out across Lebanon — gathered from
            every box office, in one place.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <CategoryFilter categories={categories} active={active} />

        {shown.length === 0 ? (
          <p className="py-24 text-center text-as-charcoal/50">
            {activeName
              ? `Nothing in ${activeName} right now — check back soon.`
              : 'No events scheduled right now — check back soon.'}
          </p>
        ) : (
          <>
            <p className="mt-8 text-sm text-as-charcoal/50">
              {shown.length} event{shown.length === 1 ? '' : 's'}
            </p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((e, i) => (
                <EventCard key={e.id} event={e} priority={i < 3} />
              ))}
            </div>
          </>
        )}
      </section>
    </>
  )
}
