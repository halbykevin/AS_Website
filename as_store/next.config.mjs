/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Product photos are now self-hosted on store-api.as.com.lb/uploads (the
    // scraper downloads them at ingest instead of hotlinking the source shops),
    // so Vercel's optimizer can fetch + resize them. Enabled 2026-07-13 after the
    // prod catalog transfer put every image on our own domain.
    // (store-api.as.com.lb is covered by the https wildcard; localhost is the
    // dev API so `npm run dev` can optimize local /uploads images too.)
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
}

export default nextConfig
