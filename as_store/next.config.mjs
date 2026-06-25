/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Placeholder product images during the UI phase.
    remotePatterns: [{ protocol: 'https', hostname: 'picsum.photos' }],
  },
}

export default nextConfig
