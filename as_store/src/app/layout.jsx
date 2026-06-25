import './globals.css'
import Providers from './providers.jsx'

export const metadata = {
  title: 'AS Store — Online shopping for tech & electronics in Lebanon',
  description:
    'AS Store by AS Company (Absolute Solutions SAL) — smartphones, audio, computing, smart home and accessories. Fast delivery across Lebanon.',
  icons: { icon: '/as-store-logo.png', apple: '/as-store-logo.png' },
}

// Root layout: html/body + global providers only. The storefront chrome
// (Nav/Footer) lives in the (store) route group, so /admin can use its own shell.
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
