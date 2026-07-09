/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Product photos are hotlinked from scraped shops (pacmax.me etc.), which
    // BLOCK requests from Vercel's image optimizer servers
    // (OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED → broken images in prod).
    // Serve images directly from the source instead; real optimization needs
    // the photos re-hosted on our own storage first.
    unoptimized: true,
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
}

export default nextConfig
