import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: appRoot,
  images: {
    // Vercel's image optimizer is disabled (2026-07-24): the prod plan's
    // optimization quota was exhausted, so `/_next/image` returned 402 and
    // product images broke. With `unoptimized`, next/image serves the source
    // directly from store-api.as.com.lb/uploads (browser/CDN-cached as usual) —
    // no optimizer, no quota, no 402. Re-enable (drop `unoptimized`) if we later
    // add a VPS-side resizer + custom loader or upgrade the plan.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
}

export default nextConfig
