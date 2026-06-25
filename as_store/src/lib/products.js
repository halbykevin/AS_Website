// Mock catalog for the UI phase, shaped for an Apple-style storefront (short
// product names + a marketing tagline). The async getProducts() imitates the
// API so the React Query wiring is real — swapped for the backend later.

const img = (seed) => `https://picsum.photos/seed/${seed}/1200/1200`
const wide = (seed) => `https://picsum.photos/seed/${seed}/1800/1100`

export const categories = ['Smartphones', 'Audio', 'Computing', 'Wearables', 'Smart Home', 'Accessories']

// Top-nav links (Apple-style minimal row).
export const navLinks = ['Store', ...categories, 'Support']

// Homepage hero copy.
export const hero = {
  eyebrow: 'AS Store',
  title: 'The best of tech.',
  sub: 'Curated, genuine and delivered across Lebanon.',
  image: wide('as-hero-main'),
}

// Pinned scroll-zoom flagship.
export const showcase = {
  name: 'Aurora Pro 5G',
  headline: 'Aurora Pro.',
  sub: 'Brilliant. In every sense.',
  image: wide('as-show-aurora'),
}

// Bento lineup tiles. `tone: 'dark'` flips a tile to black/white.
export const bento = [
  { title: 'Smartphones', copy: 'The future, in your pocket.', image: wide('bento-phone'), span: 'lg:col-span-2', tone: 'dark' },
  { title: 'Audio', copy: 'Hear the difference.', image: img('bento-audio') },
  { title: 'Wearables', copy: 'Wellness, worn well.', image: img('bento-wear') },
  { title: 'Computing', copy: 'Built to create.', image: wide('bento-comp'), span: 'lg:col-span-2' },
  { title: 'Smart Home', copy: 'A home that listens.', image: img('bento-home') },
  { title: 'Accessories', copy: 'The finishing touch.', image: img('bento-acc') },
]

export const products = [
  { id: 'p1', name: 'Aurora Pro 5G', tagline: 'Brilliant. In every sense.', category: 'Smartphones', price: 1199, image: img('as-phone-1'), colors: ['#1d1d1f', '#9aa0a6', '#2b5797', '#b0392f'] },
  { id: 'p2', name: 'Pulse Buds Air', tagline: 'Silence the world.', category: 'Audio', price: 189, image: img('as-buds-2'), colors: ['#f5f5f7', '#1d1d1f'] },
  { id: 'p3', name: 'Vortex Watch X', tagline: 'Your day, on your wrist.', category: 'Wearables', price: 349, image: img('as-watch-3'), colors: ['#1d1d1f', '#d8c4a0', '#9aa0a6'] },
  { id: 'p4', name: 'Nimbus Book 14', tagline: 'Power to go far.', category: 'Computing', price: 1549, image: img('as-laptop-4'), colors: ['#9aa0a6', '#1d1d1f'] },
  { id: 'p5', name: 'Halo Smart Hub', tagline: 'Your home, in harmony.', category: 'Smart Home', price: 129, image: img('as-hub-5'), colors: ['#f5f5f7'] },
  { id: 'p6', name: 'Quantum Charger', tagline: '65W. Tiny. Mighty.', category: 'Accessories', price: 59, image: img('as-charger-6'), colors: ['#1d1d1f', '#f5f5f7'] },
  { id: 'p7', name: 'Echo Sound Bar', tagline: 'Cinema, at home.', category: 'Audio', price: 279, image: img('as-soundbar-7'), colors: ['#1d1d1f'] },
  { id: 'p8', name: 'Nebula 4K Monitor', tagline: 'See everything.', category: 'Computing', price: 389, image: img('as-monitor-10'), colors: ['#1d1d1f'] },
  { id: 'p9', name: 'PowerCore 20K', tagline: 'All-day backup.', category: 'Accessories', price: 49, image: img('as-powerbank-12'), colors: ['#1d1d1f', '#f5f5f7'] },
  { id: 'p10', name: 'Glide Keyboard', tagline: 'Type like a dream.', category: 'Accessories', price: 119, image: img('as-keyboard-14'), colors: ['#1d1d1f', '#f5f5f7'] },
  { id: 'p11', name: 'Aura Smart Bulbs', tagline: '16 million colors.', category: 'Smart Home', price: 39, image: img('as-bulb-15'), colors: ['#f5f5f7'] },
  { id: 'p12', name: 'Vortex Fit Band', tagline: 'Move more.', category: 'Wearables', price: 89, image: img('as-band-16'), colors: ['#1d1d1f', '#b0392f'] },
]

// ---- Live API (falls back to the bundled mock if the API is offline) ----
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
const toSlug = (s) => String(s).toLowerCase().trim().replace(/\s+/g, '-')

export async function getProducts({ category } = {}) {
  try {
    const qs =
      category && category !== 'All' ? `?category=${encodeURIComponent(toSlug(category))}` : ''
    const res = await fetch(`${API}/api/products${qs}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    // API down → render the bundled sample so the site never breaks.
    if (!category || category === 'All') return products
    return products.filter((p) => p.category === category)
  }
}
