// This site's own address. A module of its own because two files need it and
// neither can import the other: lib/seo.js (canonicals, sitemap, JSON-LD)
// imports lib/events.js, and lib/events.js puts a link back here into every
// reservation message. Set NEXT_PUBLIC_SITE_URL; the fallback is only so local
// builds don't crash.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://ticketing.as.com.lb'
).replace(/\/$/, '')
