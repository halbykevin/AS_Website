import Nav from '@/components/Nav.jsx'
import Footer from '@/components/Footer.jsx'
import CartDrawer from '@/components/CartDrawer.jsx'
import SmoothScroll from '@/components/SmoothScroll.jsx'
import { loadSettings } from '@/lib/site'
import { loadCategories } from '@/lib/catalog'

// Storefront chrome — loads CMS settings (announcement, footer, contact,
// socials) plus the categories that drive the nav menu, and feeds them to the
// nav + footer. The cart drawer lives here so it's available on every page.
// Everything scrolls through Lenis for buttery scroll-linked animation.
export default async function StoreLayout({ children }) {
  const [settings, categories] = await Promise.all([loadSettings(), loadCategories()])
  return (
    <SmoothScroll>
      {/* overflow-x-clip (not hidden — sticky still works) so no wide
          animation track can ever expand the mobile layout viewport. */}
      <div className="flex min-h-screen flex-col overflow-x-clip">
        <Nav settings={settings} categories={categories} />
        <main className="flex-1">{children}</main>
        <Footer settings={settings} />
        <CartDrawer whatsapp={settings?.contact?.whatsapp} />
      </div>
    </SmoothScroll>
  )
}
