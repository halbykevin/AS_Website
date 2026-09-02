import { getCategories, getEvents } from '@/lib/api'
import { SITE_URL } from '@/lib/seo'

// Regenerated on the same clock as the pages themselves. Without this the
// sitemap is frozen at build time, which on a platform whose whole content
// turns over every few weeks means Google is handed a list of finished shows.
export const revalidate = 300

export default async function sitemap() {
  const [events, categories] = await Promise.all([getEvents(), getCategories()])
  const now = new Date()

  return [
    { url: `${SITE_URL}/events`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    // The category tabs are real, indexable pages with their own titles and
    // canonicals — so they belong here, ranked below the full listing.
    ...categories.map((c) => ({
      url: `${SITE_URL}/events?category=${c.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    })),
    // Upcoming events only. A finished event's page stays up and stays linked,
    // but it is noindexed, and asking Google to crawl a page we then tell it to
    // drop wastes the budget on the pages that still sell tickets.
    ...events.map((e) => ({
      url: `${SITE_URL}/events/${e.slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    })),
  ]
}
