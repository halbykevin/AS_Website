// Loads the CMS-driven homepage blocks (server-side). Cached under the shared
// 'store' tag and purged on admin writes so edits show immediately. Falls back
// to the original hardcoded layout if the API is offline, so the homepage never
// renders empty.

import { STORE_CACHE } from './catalog'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

export const defaultSections = [
  {
    id: 'd-hero',
    type: 'hero',
    eyebrow: 'AS Store',
    heading: 'The best of tech.',
    subheading: 'Curated, genuine and delivered across Lebanon.',
    body: '',
    imageUrl: 'https://picsum.photos/seed/as-hero-main/1800/1100',
    bg: '',
    textTheme: 'auto',
    settings: {
      buttons: [
        { label: 'Learn more', href: '#showcase' },
        { label: 'Shop', href: '#latest' },
      ],
    },
    visible: true,
    sort: 1,
  },
  {
    id: 'd-showcase',
    type: 'showcase',
    eyebrow: 'Aurora Pro 5G',
    heading: 'Aurora Pro.',
    subheading: 'Brilliant. In every sense.',
    body: '',
    imageUrl: 'https://picsum.photos/seed/as-show-aurora/1800/1100',
    bg: '#000000',
    textTheme: 'dark',
    settings: {
      buttons: [
        { label: 'Learn more', href: '#latest' },
        { label: 'Buy', href: '#latest' },
      ],
    },
    visible: true,
    sort: 2,
  },
  {
    id: 'd-rail-latest',
    type: 'productRail',
    heading: 'The latest.',
    subheading: "Take a look at what's new, right now.",
    settings: { category: 'All', anchor: 'latest' },
    visible: true,
    sort: 3,
  },
  {
    id: 'd-bento',
    type: 'bento',
    heading: 'Explore the lineup.',
    settings: {
      tiles: [
        { title: 'Smartphones', copy: 'The future, in your pocket.', image: 'https://picsum.photos/seed/bento-phone/1800/1100', tone: 'dark', span: 'lg:col-span-2' },
        { title: 'Audio', copy: 'Hear the difference.', image: 'https://picsum.photos/seed/bento-audio/1200/1200' },
        { title: 'Wearables', copy: 'Wellness, worn well.', image: 'https://picsum.photos/seed/bento-wear/1200/1200' },
        { title: 'Computing', copy: 'Built to create.', image: 'https://picsum.photos/seed/bento-comp/1800/1100', span: 'lg:col-span-2' },
        { title: 'Smart Home', copy: 'A home that listens.', image: 'https://picsum.photos/seed/bento-home/1200/1200' },
        { title: 'Accessories', copy: 'The finishing touch.', image: 'https://picsum.photos/seed/bento-acc/1200/1200' },
      ],
    },
    visible: true,
    sort: 4,
  },
  {
    id: 'd-rail-acc',
    type: 'productRail',
    heading: 'Accessories.',
    subheading: 'Top off your setup.',
    settings: { category: 'Accessories' },
    visible: true,
    sort: 5,
  },
  {
    id: 'd-cta',
    type: 'cta',
    heading: 'Shop the entire AS Store.',
    subheading: 'Genuine tech, official warranty, delivered across Lebanon.',
    settings: { buttons: [{ label: 'Browse all products', href: '#' }] },
    visible: true,
    sort: 6,
  },
]

export async function loadHomepageSections() {
  try {
    const res = await fetch(`${API}/api/homepage-sections`, STORE_CACHE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const sections = await res.json()
    // If the table hasn't been seeded yet, use the default layout.
    return Array.isArray(sections) && sections.length ? sections : defaultSections
  } catch {
    return defaultSections
  }
}
