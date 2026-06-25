import Nav from '@/components/Nav.jsx'
import Footer from '@/components/Footer.jsx'
import { loadSettings } from '@/lib/site'

// Storefront chrome — loads CMS settings (nav links, announcement, footer,
// contact, socials) and feeds them to the nav + footer.
export default async function StoreLayout({ children }) {
  const settings = await loadSettings()
  return (
    <div className="flex min-h-screen flex-col">
      <Nav settings={settings} />
      <main className="flex-1">{children}</main>
      <Footer settings={settings} />
    </div>
  )
}
