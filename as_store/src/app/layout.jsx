import './globals.css'
import Script from 'next/script'
import { Inter } from 'next/font/google'
import Providers from './providers.jsx'
import { loadSettings } from '@/lib/site'
import {
  SITE_URL,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
  organizationJsonLd,
  jsonLdScript,
} from '@/lib/seo'

// Google Analytics 4 measurement ID (public — safe to ship in the client).
const GA_ID = 'G-HVDQE4SMTB'

// Self-hosted at build time (no render-blocking Google Fonts request / preconnects).
// Exposed as a CSS variable wired into tailwind's `sans` stack.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-inter',
})

const TITLE = 'AS Store — Online shopping for tech & electronics in Lebanon'
const DESCRIPTION =
  'AS Store by AS Company (Absolute Solutions SAL) — smartphones, audio, computing, smart home and accessories. Fast delivery across Lebanon.'

export const metadata = {
  // Makes every relative canonical / OG url resolve to the production origin.
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    // Child pages set just their own title; the site name is appended here.
    template: '%s | AS Store',
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'AS Store',
    'AS Company',
    'electronics Lebanon',
    'smartphones Lebanon',
    'online shopping Lebanon',
    'tech store Lebanon',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  icons: { icon: '/favicon-96.png', apple: '/favicon-96.png' },
}

// Root layout: html/body + global providers only. The storefront chrome
// (Nav/Footer) lives in the (store) route group, so /admin can use its own shell.
export default async function RootLayout({ children }) {
  const settings = await loadSettings()
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* Organization + WebSite structured data (brand knowledge panel + sitelinks search) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript(organizationJsonLd(settings))}
        />
        {/* Google tag (gtag.js) — loads after the page is interactive */}
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
