const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ticketing.as.com.lb'

export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
