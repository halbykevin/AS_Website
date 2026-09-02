import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app is one of three in the repo; without this Next walks up to the
  // monorepo root and traces the other two into the bundle.
  outputFileTracingRoot: appRoot,
  images: {
    // Same call as the store: the Vercel image optimizer is off, so next/image
    // serves the source directly. Event photos come from three ticketing CDNs
    // we don't control, and none of them is worth an optimization quota.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
}

export default nextConfig
