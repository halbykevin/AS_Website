/**
 * One-off store setup:
 *  - purge Payload demo data (non-scraped products, all variants, demo customer)
 *  - fix the Footer global nav (remove Payload links)
 *  - create a real AS "home" page (hero + featured products + CTA)
 *   pnpm payload run src/scripts/setupStore.ts
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const payload = await getPayload({ config })

// --- lexical helpers -------------------------------------------------------
const text = (t: string) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: t,
  version: 1,
})
const heading = (tag: string, t: string) => ({
  type: 'heading',
  tag,
  children: [text(t)],
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
})
const paragraph = (t: string) => ({
  type: 'paragraph',
  children: [text(t)],
  direction: 'ltr',
  format: '',
  indent: 0,
  textFormat: 0,
  version: 1,
})
const richText = (...children: unknown[]) => ({
  root: { type: 'root', children, direction: 'ltr', format: '', indent: 0, version: 1 },
})

// --- 1) purge demo data ----------------------------------------------------
const variants = await payload.delete({ collection: 'variants', where: {} })
const demoProducts = await payload.delete({
  collection: 'products',
  where: { sourceUrl: { exists: false } },
})
const demoUsers = await payload.delete({
  collection: 'users',
  where: { email: { equals: 'customer@example.com' } },
})

// --- 2) fix footer nav -----------------------------------------------------
await payload.updateGlobal({
  slug: 'footer',
  data: {
    navItems: [
      { link: { type: 'custom', newTab: false, label: 'Shop', url: '/shop' } },
      { link: { type: 'custom', newTab: false, label: 'Find my order', url: '/find-order' } },
    ],
  },
})

// --- 3) build the home page ------------------------------------------------
const featured = await payload.find({
  collection: 'products',
  where: { sourceUrl: { exists: true } },
  limit: 3,
  depth: 0,
  sort: '-createdAt',
})
const featuredIds = featured.docs.map((d) => d.id)

const layout: unknown[] = []
if (featuredIds.length === 3) {
  layout.push({ blockType: 'threeItemGrid', blockName: 'Featured', products: featuredIds })
}
layout.push({
  blockType: 'cta',
  blockName: 'CTA',
  richText: richText(
    heading('h3', 'Telecom & electronics, delivered across Lebanon'),
    paragraph('Browse the full AS Store catalog — laptops, gaming gear, and more.'),
  ),
  links: [
    { link: { type: 'custom', appearance: 'default', newTab: false, label: 'Browse all products', url: '/shop' } },
  ],
})

const homeData = {
  slug: 'home',
  _status: 'published' as const,
  title: 'Home',
  hero: {
    type: 'lowImpact' as const,
    richText: richText(
      heading('h1', 'AS Store'),
      paragraph('Lebanon’s market leader in telecommunication and electronics since 2008.'),
    ),
    links: [
      { link: { type: 'custom', appearance: 'default', newTab: false, label: 'Shop now', url: '/shop' } },
    ],
  },
  layout,
  meta: {
    title: 'AS Store — Telecom & Electronics in Lebanon',
    description:
      'Shop the latest telecommunication and electronics from AS Company (Absolute Solutions) in Lebanon.',
  },
}

const existingHome = await payload.find({
  collection: 'pages',
  where: { slug: { equals: 'home' } },
  limit: 1,
  depth: 0,
})
// disableRevalidate: revalidatePath only works inside a Next request, not here.
if (existingHome.docs[0]) {
  await payload.update({
    collection: 'pages',
    id: existingHome.docs[0].id,
    data: homeData,
    context: { disableRevalidate: true },
  })
} else {
  await payload.create({ collection: 'pages', data: homeData, context: { disableRevalidate: true } })
}

console.log(
  `purged: products=${demoProducts.docs.length}, variants=${variants.docs.length}, ` +
    `users=${demoUsers.docs.length}; home page ${existingHome.docs[0] ? 'updated' : 'created'} ` +
    `with ${featuredIds.length} featured products; footer nav fixed.`,
)
