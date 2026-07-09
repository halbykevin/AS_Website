/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Product photos are hotlinked from scraped shops (pacmax.me today, others
    // tomorrow) plus our own API uploads — allow any https host so next/image
    // can resize them all down to their display size and serve WebP/AVIF.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
}

export default nextConfig
