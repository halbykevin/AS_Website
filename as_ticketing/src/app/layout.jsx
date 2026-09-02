import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { getSettings } from '@/lib/api'
import {
  DEFAULT_OG_IMAGES,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  jsonLdScript,
  organizationJsonLd,
} from '@/lib/seo'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

// Self-hosted from the build rather than fetched from fonts.googleapis.com. The
// stylesheet link it replaces was render-blocking on a third-party origin — two
// connections and a round trip in front of the first paint, on a page whose
// whole job is to show event artwork fast.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-inter',
})

// Its own GA4 property, deliberately separate from as.com.lb (G-EX7D8HZPKY)
// and the store (G-HVDQE4SMTB): three different audiences doing three different
// things, and pooling them would make all three reports useless.
//
// Off in dev and on preview deploys, so the property only ever counts real
// visits — otherwise every local page load and every branch preview shows up as
// traffic and quietly skews the numbers you make decisions on.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-E38CG7J8VT'
const ANALYTICS_ON =
  Boolean(GA_ID) && process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview'

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    // Search intent first: people type "events in Lebanon", not the name of a
    // platform they haven't heard of yet. The brand still closes the title.
    default: `${SITE_TAGLINE} · ${SITE_NAME}`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    'Every upcoming concert, comedy night, play, festival and party across Lebanon — gathered from every box office into one place, by AS Company.',
  applicationName: SITE_NAME,
  alternates: { canonical: '/events' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    url: SITE_URL,
    locale: 'en_US',
    images: DEFAULT_OG_IMAGES,
  },
  twitter: { card: 'summary_large_image', images: DEFAULT_OG_IMAGES },
  robots: {
    index: true,
    follow: true,
    // Without max-image-preview:large an event photo can't be used as the big
    // thumbnail in Discover or in the events carousel — which is most of the
    // reason someone clicks one result over another.
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  formatDetection: { telephone: false },
}

export const viewport = {
  themeColor: '#A41E22',
  colorScheme: 'light',
}

export default async function RootLayout({ children }) {
  const settings = await getSettings()
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* The three ticketing partners each serve event photos from their own
            CDN, and those images are the largest thing on every page. */}
        <link rel="preconnect" href="https://cdn.ticketingboxoffice.com" crossOrigin="" />
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" crossOrigin="" />
        <link rel="preconnect" href="https://images-ihjoz-com.s3.amazonaws.com" crossOrigin="" />
        {/* Organization + WebSite, once for the whole property. Every Event on
            every page points its `organizer` at the @id declared here rather
            than restating the company, so Google reads one publisher across the
            site instead of a few hundred unrelated ones. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript(organizationJsonLd(settings))}
        />
      </head>
      <body className="flex min-h-screen flex-col">
        {ANALYTICS_ON && (
          <>
            {/* afterInteractive, not beforeInteractive: analytics must never sit
                in front of the events rendering. */}
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
            </Script>
          </>
        )}
        <Header />
        <main className="flex-1">{children}</main>
        <Footer settings={settings} />
      </body>
    </html>
  )
}
