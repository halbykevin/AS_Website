import Script from 'next/script'
import './globals.css'
import { getSettings } from '@/lib/api'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ticketing.as.com.lb'

// Its own GA4 property, deliberately separate from as.com.lb (G-EX7D8HZPKY)
// and the store (G-HVDQE4SMTB): three different audiences doing three different
// things, and pooling them would make all three reports useless.
//
// Off in dev and on preview deploys, so the property only ever counts real
// visits — otherwise every local page load and every branch preview shows up as
// traffic and quietly skews the numbers you make decisions on.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-FTXR4CSMJ3'
const ANALYTICS_ON =
  Boolean(GA_ID) && process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview'

export const metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'AS Ticketing Hub — what’s on in Lebanon',
    template: '%s · AS Ticketing Hub',
  },
  description:
    'Concerts, comedy, theatre, festivals and nights out across Lebanon — every event in one place, by AS Company.',
  openGraph: {
    type: 'website',
    siteName: 'AS Ticketing Hub',
    url: SITE,
    images: ['/as-ticketing-hub-logo.png'],
  },
  robots: { index: true, follow: true },
}

export default async function RootLayout({ children }) {
  const settings = await getSettings()
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* The three ticketing partners each serve event photos from their own
            CDN, and those images are the largest thing on every page. */}
        <link rel="preconnect" href="https://cdn.ticketingboxoffice.com" crossOrigin="" />
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" crossOrigin="" />
        <link rel="preconnect" href="https://images-ihjoz-com.s3.amazonaws.com" crossOrigin="" />
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
