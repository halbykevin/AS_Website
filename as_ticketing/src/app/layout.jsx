import './globals.css'
import { getSettings } from '@/lib/api'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ticketing.as.com.lb'

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
        <Header />
        <main className="flex-1">{children}</main>
        <Footer settings={settings} />
      </body>
    </html>
  )
}
