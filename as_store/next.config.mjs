/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Historically product photos were hotlinked from scraped shops (pacmax.me
    // etc.), which BLOCK Vercel's image optimizer
    // (OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED → broken images in prod), so
    // optimization was disabled. The scraper now downloads images onto our own
    // /uploads (store-api.as.com.lb) at ingest, and `npm run backfill-images`
    // converts existing ones.
    //
    // TO ENABLE OPTIMIZATION — only AFTER the backfill has run in production so
    // no product still points at a shop's domain: flip `unoptimized` to false.
    // (store-api.as.com.lb is already covered by the wildcard remotePattern.)
    unoptimized: true,
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
}

export default nextConfig
