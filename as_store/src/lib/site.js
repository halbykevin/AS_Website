// Loads site-wide settings + content pages from the API (server-side, no cache
// so CMS edits show immediately). Falls back to sensible defaults if the API is
// offline so the storefront never breaks.

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

export const defaultSettings = {
  storeName: 'AS Store',
  announcement: { enabled: true, text: 'Free delivery across Lebanon · 12-month warranty' },
  contact: { email: '', phone: '', whatsapp: '', address: '' },
  socials: {},
  navLinks: [
    { label: 'Store', href: '/' },
    { label: 'Smartphones', href: '/' },
    { label: 'Audio', href: '/' },
    { label: 'Computing', href: '/' },
    { label: 'Wearables', href: '/' },
    { label: 'Smart Home', href: '/' },
    { label: 'Accessories', href: '/' },
    { label: 'Support', href: '/pages/support' },
  ],
  footerGroups: [
    { title: 'Shop', links: [{ label: 'Smartphones', href: '/' }, { label: 'Audio', href: '/' }, { label: 'Computing', href: '/' }, { label: 'Accessories', href: '/' }] },
    { title: 'Support', links: [{ label: 'Contact us', href: '/pages/contact' }, { label: 'Warranty', href: '/pages/warranty' }] },
    { title: 'Company', links: [{ label: 'About AS', href: '/pages/about' }] },
  ],
}

export async function loadSettings() {
  try {
    const res = await fetch(`${API}/api/settings`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const s = await res.json()
    return {
      ...defaultSettings,
      ...s,
      announcement: { ...defaultSettings.announcement, ...(s.announcement || {}) },
      contact: { ...defaultSettings.contact, ...(s.contact || {}) },
      socials: s.socials || {},
      navLinks: s.navLinks?.length ? s.navLinks : defaultSettings.navLinks,
      footerGroups: s.footerGroups?.length ? s.footerGroups : defaultSettings.footerGroups,
    }
  } catch {
    return defaultSettings
  }
}

export async function loadPage(slug) {
  try {
    const res = await fetch(`${API}/api/pages/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
