import { getCategories, getEvents } from '@/lib/api'
import {
  SITE_NAME,
  breadcrumbJsonLd,
  eventListJsonLd,
  jsonLdScript,
  metaDescription,
} from '@/lib/seo'
import EventCard from '@/components/EventCard'
import CategoryFilter from '@/components/CategoryFilter'

/**
 * Each category filter is a page in its own right in Google's eyes — someone
 * searching "concerts in Lebanon" should land on the concerts tab, not on the
 * whole listing — so every one gets its own title, description and canonical
 * rather than inheriting the listing's and competing with it.
 *
 * A `category` value that matches nothing (a stale link, a guessed parameter)
 * gets noindexed instead: an empty page indexed under a real-sounding URL is
 * the classic way a listing site accumulates thin content.
 */
export async function generateMetadata({ searchParams }) {
  const params = await searchParams
  const active = typeof params?.category === 'string' ? params.category : ''
  if (!active) {
    return {
      title: 'What’s on in Lebanon',
      description:
        'Every upcoming concert, comedy night, play, festival and party across Lebanon — in one place.',
      alternates: { canonical: '/events' },
    }
  }

  const categories = await getCategories()
  const match = categories.find((c) => c.slug === active)
  if (!match) return { title: 'What’s on in Lebanon', robots: { index: false, follow: true } }

  return {
    title: `${match.name} in Lebanon`,
    description: metaDescription(
      `Upcoming ${match.name.toLowerCase()} events in Lebanon — dates, venues and how to reserve, gathered from every box office by ${SITE_NAME}.`,
    ),
    alternates: { canonical: `/events?category=${match.slug}` },
  }
}

export default async function EventsPage({ searchParams }) {
  const params = await searchParams
  const active = typeof params?.category === 'string' ? params.category : ''

  const [events, categories] = await Promise.all([getEvents(), getCategories()])
  const shown = active ? events.filter((e) => e.categorySlug === active) : events
  const activeName = categories.find((c) => c.slug === active)?.name

  const path = activeName ? `/events?category=${active}` : '/events'
  const heading = activeName ? `${activeName} in Lebanon` : 'What’s on in Lebanon'
  const list = eventListJsonLd(shown, { name: heading, url: path })
  const crumbs = breadcrumbJsonLd(
    activeName
      ? [
          { name: 'Events', url: '/events' },
          { name: activeName, url: path },
        ]
      : [{ name: 'Events', url: '/events' }],
  )

  return (
    <>
      {list && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(list)} />}
      {crumbs && (
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />
      )}

      <section className="bg-as-ink">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {heading}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/60">
            {activeName
              ? `Every upcoming ${activeName.toLowerCase()} event across Lebanon — dates, venues and how to reserve.`
              : 'Concerts, comedy, theatre, festivals and nights out across Lebanon — gathered from every box office, in one place.'}
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
