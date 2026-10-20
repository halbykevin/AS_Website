/**
 * A URL for the /events listing. The parameters always come in the same order,
 * so one view has one URL — the filter links, the canonical and the sitemap all
 * agree. Without a source or a search these are exactly the indexable
 * /events?category=<slug> pages.
 */
export function listingHref({ category = '', source = '', q = '' } = {}) {
  const parts = []
  if (category) parts.push(`category=${encodeURIComponent(category)}`)
  if (source) parts.push(`source=${encodeURIComponent(source)}`)
  if (q) parts.push(`q=${encodeURIComponent(q)}`)
  return parts.length ? `/events?${parts.join('&')}` : '/events'
}
