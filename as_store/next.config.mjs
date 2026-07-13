/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Product photos are now self-hosted on store-api.as.com.lb/uploads (the
    // scraper downloads them at ingest instead of hotlinking the source shops),
    // so Vercel's optimizer can fetch + resize them. Enabled 2026-07-13 after the
    // prod catalog transfer put every image on our own domain.
    // (store-api.as.com.lb is covered by the wildcard remotePattern below.)
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
}

export default nextConfig
