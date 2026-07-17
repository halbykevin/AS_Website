import { SITE_URL } from '@/lib/seo'

// Served at /robots.txt. Points crawlers at the sitemap and keeps them out of
// private (admin/account/checkout) and thin/duplicate (search results, cart)
// routes so crawl budget goes to real product & category pages.
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/account', '/auth', '/checkout', '/login', '/register', '/search', '/api'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
