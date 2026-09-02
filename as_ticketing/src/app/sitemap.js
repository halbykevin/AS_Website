import { getEvents } from '@/lib/api'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ticketing.as.com.lb'

export default async function sitemap() {
  const events = await getEvents()
  return [
    { url: `${SITE}/events`, changeFrequency: 'daily', priority: 1 },
    ...events.map((e) => ({
      url: `${SITE}/events/${e.slug}`,
      changeFrequency: 'weekly',
      priority: 0.8,
    })),
  ]
}
