import Link from 'next/link'

import { getCategories, getEvents, getSearchIndex } from '@/lib/api'
import { searchEvents } from '@/lib/search'
import {
  SITE_NAME,
  breadcrumbJsonLd,
  eventListJsonLd,
  jsonLdScript,
  metaDescription,
} from '@/lib/seo'
import { listingHref } from '@/lib/listing'
import { SOURCES, sourceBySlug, sourceOf } from '@/lib/sources'
import EventCard from '@/components/EventCard'
import EventSearch from '@/components/EventSearch'
import EventFilters from '@/components/EventFilters'

/** A query long enough to be a search and short enough to be a title. */
const readQuery = (params) =>
  typeof params?.q === 'string' ? params.q.trim().replace(/\s+/g, ' ').slice(0, 80) : ''

const readSource = (params) => (typeof params?.source === 'string' ? params.source : '')

/**
 * Each category filter is a page in its own right in Google's eyes — someone
 * searching "concerts in Lebanon" should land on the concerts tab, not on the
 * whole listing — so every one gets its own title, description and canonical
 * rather than inheriting the listing's and competing with it.
 *
 * A `category` value that matches nothing (a stale link, a guessed parameter)
 * gets noindexed instead: an empty page indexed under a real-sounding URL is
 * the classic way a listing site accumulates thin content.
 *
 * A `q` search is noindexed for the same reason, and always — the query space
 * is infinite and every result page is a rearrangement of pages Google already
 * has. `follow` keeps the links live, and the canonical points at the search
 * URL itself rather than at /events: a noindexed page canonicalising to another
 * one is how you talk Google into dropping the page it points at.
 *
 * A `source` view is noindexed the same way: it is the same events cut another
 * way, and a page per ticketing site would only compete with the category
 * pages — and rank us for the partners' own names.
 */
export async function generateMetadata({ searchParams }) {
  const params = await searchParams
  const active = typeof params?.category === 'string' ? params.category : ''
  const q = readQuery(params)
  const sourceSlug = readSource(params)

  if (q) {
    return {
      title: `Search: ${q}`,
      description: metaDescription(
        `Events in Lebanon matching “${q}” — dates, venues and how to reserve, gathered from every box office by ${SITE_NAME}.`,
      ),
      alternates: { canonical: listingHref({ category: active, source: sourceSlug, q }) },
      robots: { index: false, follow: true },
    }
  }

  if (sourceSlug) {
    const source = sourceBySlug(sourceSlug)
    const categoryName = active ? (await getCategories()).find((c) => c.slug === active)?.name : ''
    if (!source) return { title: 'What’s on in Lebanon', robots: { index: false, follow: true } }
    return {
      title: `${categoryName || 'Events'} from ${source.name}`,
      description: metaDescription(
        `Upcoming ${categoryName ? `${categoryName.toLowerCase()} ` : ''}events in Lebanon from ${source.name} — dates, venues and how to reserve with ${SITE_NAME}.`,
      ),
      alternates: { canonical: listingHref({ category: active, source: source.slug }) },
      robots: { index: false, follow: true },
    }
  }

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
  const q = readQuery(params)
  // An unknown source is ignored rather than emptying the page; its metadata
  // has already noindexed the URL.
  const source = sourceBySlug(readSource(params))

  const [events, categories, index] = await Promise.all([
    getEvents(),
    getCategories(),
    getSearchIndex(),
  ])
  const inCategory = active ? events.filter((e) => e.categorySlug === active) : events
  // Ranked by how well each one answers the query, then by date within a tie.
  // The server searches descriptions too, so this can legitimately return an
  // event the suggestion dropdown didn't offer — a support act named in the
  // blurb and nowhere else. See lib/search.js.
  const matching = searchEvents(inCategory, q)
  const shown = source ? matching.filter((e) => sourceOf(e) === source) : matching
  const activeName = categories.find((c) => c.slug === active)?.name

  // Every site the calendar has something from, plus AS Company's own events
  // always — each counted under the current category and search.
  const listed = new Set(events.map(sourceOf))
  const sources = SOURCES.filter((s) => !s.key || listed.has(s)).map((s) => ({
    ...s,
    count: matching.filter((e) => sourceOf(e) === s).length,
  }))

  const path = activeName ? `/events?category=${active}` : '/events'
  const heading = q
    ? `Results for “${q}”`
    : source
      ? `${activeName || 'Events'} from ${source.name}`
      : activeName
        ? `${activeName} in Lebanon`
        : 'What’s on in Lebanon'
  // " in Comedy", " from Antoine Ticketing" — whichever filters are on.
  const scope = [activeName && ` in ${activeName}`, source && ` from ${source.name}`]
    .filter(Boolean)
    .join('')

  // No structured data on a search or a source page. Both are noindexed by
  // design, and feeding an ItemList of the same events under a URL Google is
  // told to ignore only adds a second, weaker description of pages it already has.
  const list = q || source ? null : eventListJsonLd(shown, { name: heading, url: path })
  const crumbs = q || source
    ? null
    : breadcrumbJsonLd(
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
            {q
              ? `${shown.length} event${shown.length === 1 ? '' : 's'} match your search${scope}.`
              : source
                ? `Upcoming ${activeName ? `${activeName.toLowerCase()} ` : ''}events from ${source.name} — dates, venues and how to reserve.`
                : activeName
                ? `Every upcoming ${activeName.toLowerCase()} event across Lebanon — dates, venues and how to reserve.`
                : 'Concerts, comedy, theatre, festivals and nights out across Lebanon — gathered from every box office, in one place.'}
          </p>
          {/* The search field sits in the hero because finding a name is the
              first thing most people arrive wanting to do — the category tabs
              answer the other question, "what is on at all". */}
          <div className="mt-7 max-w-xl">
            <EventSearch events={index} initialQuery={q} variant="hero" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <EventFilters
          categories={categories}
          sources={sources}
          category={active}
          source={source?.slug || ''}
          query={q}
        />

        {shown.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-as-charcoal/50">
              {q
                ? `Nothing matches “${q}”${scope}.`
                : scope
                  ? `Nothing${scope} right now — check back soon.`
                  : 'No events scheduled right now — check back soon.'}
            </p>
            {q ? (
              <p className="mt-3 text-sm text-as-charcoal/45">
                Try an artist or a venue, or{' '}
                <Link href="/events" className="font-semibold text-as-red hover:underline">
                  browse everything that’s on
                </Link>
                .
              </p>
            ) : null}
          </div>
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
