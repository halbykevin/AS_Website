// Loads site-wide settings + content pages from the API (server-side, no cache
// so CMS edits show immediately). Falls back to sensible defaults if the API is
// offline so the storefront never breaks.

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

export const defaultSettings = {
  storeName: 'AS Store',
  // Only used when the API is unreachable: never black out a live store over
  // an API hiccup. The real gate is settings.published from the database.
  published: true,
  announcement: { enabled: true, text: 'Free delivery on orders over $100 · 12 months warranty' },
  contact: { email: '', phone: '', whatsapp: '', address: '' },
  socials: {},
  showcaseBg: '#000000',
  navLogoSize: 20,
  navLogoSizeMobile: 18,
  // Homepage "New arrivals" section (the first block on the homepage).
  homeNew: { enabled: true, eyebrow: 'Just landed', heading: 'New in.', source: 'newest', categoryId: null, count: 8 },
  // Sign-in page: your branding on the email-code button.
  loginButton: { label: 'Continue with email', logo: '', weight: 'medium' },
  // The category links are built from the categories themselves; these are just
  // extra custom links appended after them (the nav menu is category-driven).
  navLinks: [{ label: 'Support', href: '/pages/support' }],
  footerGroups: [
    { title: 'Shop', links: [{ label: 'All products', href: '/shop' }, { label: 'New arrivals', href: '/shop?sort=newest' }, { label: 'On sale', href: '/shop?sale=1' }] },
    { title: 'Support', links: [{ label: 'Contact us', href: '/pages/contact' }, { label: 'Warranty', href: '/pages/warranty' }, { label: 'Shipping & Returns', href: '/pages/shipping' }] },
    { title: 'Company', links: [{ label: 'About AS', href: '/pages/about' }, { label: 'Privacy Policy', href: '/pages/privacy' }] },
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
      homeNew: { ...defaultSettings.homeNew, ...(s.homeNew || {}) },
      loginButton: { ...defaultSettings.loginButton, ...(s.loginButton || {}) },
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
