import './globals.css'
import { Inter } from 'next/font/google'
import Providers from './providers.jsx'

// Self-hosted at build time (no render-blocking Google Fonts request / preconnects).
// Exposed as a CSS variable wired into tailwind's `sans` stack.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata = {
  title: 'AS Store — Online shopping for tech & electronics in Lebanon',
  description:
    'AS Store by AS Company (Absolute Solutions SAL) — smartphones, audio, computing, smart home and accessories. Fast delivery across Lebanon.',
  icons: { icon: '/favicon-96.png', apple: '/favicon-96.png' },
}

// Root layout: html/body + global providers only. The storefront chrome
// (Nav/Footer) lives in the (store) route group, so /admin can use its own shell.
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
