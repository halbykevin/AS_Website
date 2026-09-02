import { SITE_URL } from '@/lib/seo'

export const revalidate = 86400

// Nothing here is blocked on purpose — /_next/ in particular must stay
// crawlable, since Google renders the page before it ranks it and a blocked
// stylesheet or script makes it render a broken one. What should not be indexed
// (finished events, an unknown category filter) says so per page with a robots
// meta tag, which is the only signal that also removes an already-indexed URL.
export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
