import Nav from '@/components/Nav.jsx'
import Footer from '@/components/Footer.jsx'
import CartDrawer from '@/components/CartDrawer.jsx'
import StorePopup from '@/components/StorePopup.jsx'
import ChatWidget from '@/components/ChatWidget.jsx'
import PublishGate from '@/components/PublishGate.jsx'
import ComingSoon from '@/components/ComingSoon.jsx'
import { loadSettings } from '@/lib/site'
import { loadCategories } from '@/lib/catalog'
import { aiConfigured } from '@/lib/ai'

// Storefront chrome — loads CMS settings (announcement, footer, contact,
// socials) plus the categories that drive the nav menu, and feeds them to the
// nav + footer. The cart drawer lives here so it's available on every page.
// Scrolling is native (Lenis was removed: its always-on rAF loop dominated
// main-thread time and made low-end phones janky; anchor links smooth-scroll
// via CSS scroll-behavior instead).
// The whole public storefront sits behind the publish gate (settings.published,
// toggled in /admin/settings) — /admin has its own layout and is never gated.
// The promotions popup loads its own data client-side (see StorePopup): these
// pages are prerendered and CDN-held, so anything baked in here can be hours
// stale, which is not acceptable for an on/off switch.

// Safety-net TTL for the whole storefront segment. The `next: { revalidate }`
// on the loaders' fetches only bounds the *data* cache — it does not give the
// route one, so pages with no dynamic input (the homepage) were prerendered
// once with `revalidate: false` and served by the CDN forever. Declaring it
// here makes those pages ISR: /api/revalidate purges them the moment an admin
// saves, and this hour is the backstop if that purge is ever missed.
export const revalidate = 3600

export default async function StoreLayout({ children }) {
  const [settings, categories] = await Promise.all([loadSettings(), loadCategories()])
  return (
    <PublishGate published={Boolean(settings.published)} fallback={<ComingSoon settings={settings} />}>
      {/* overflow-x-clip (not hidden — sticky still works) so no wide
          animation track can ever expand the mobile layout viewport. */}
      <div className="flex min-h-screen flex-col overflow-x-clip">
        <Nav settings={settings} categories={categories} />
        <main className="flex-1">{children}</main>
        <Footer settings={settings} />
        <CartDrawer whatsapp={settings?.contact?.whatsapp} />
        <StorePopup />
        {/* No API key configured (e.g. the env var is missing on Vercel) means no
            bubble at all — better than offering an assistant that answers every
            question with an error. Checked on the server, so the key itself
            never reaches the browser. Hides itself during checkout too. */}
        {aiConfigured() && <ChatWidget />}
      </div>
    </PublishGate>
  )
}
