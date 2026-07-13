import { SITE_URL } from '@/lib/seo'
import { loadAllProducts, loadCategories } from '@/lib/catalog'
import { loadPage } from '@/lib/site'

// Dynamic sitemap: static routes + every visible category + every visible
// product + published CMS pages. Next.js serves this at /sitemap.xml and it's
// declared in robots.js so Google discovers the whole catalog.
//
// export const revalidate keeps it cheap: regenerated at most every hour rather
// than hitting the API on every crawler request.
export const revalidate = 3600

const STATIC_PAGES = ['/pages/about', '/pages/support', '/pages/warranty']

export default async function sitemap() {
  const now = new Date()

  const staticRoutes = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/shop`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/contact`, changeFrequency: 'yearly', priority: 0.3 },
  ].map((r) => ({ lastModified: now, ...r }))

  const [products, categories] = await Promise.all([loadAllProducts(), loadCategories()])

  const categoryRoutes = categories.map((c) => ({
    url: `${SITE_URL}/category/${c.slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.8,
  }))

  const productRoutes = products
    .filter((p) => p.slug)
    .map((p) => ({
      url: `${SITE_URL}/product/${p.slug}`,
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      changeFrequency: 'weekly',
      priority: 0.7,
    }))

  // Only include CMS pages that actually exist (loadPage returns null otherwise).
  const cmsPages = await Promise.all(
    STATIC_PAGES.map(async (path) => {
      const slug = path.split('/').pop()
      const page = await loadPage(slug)
      return page
        ? { url: `${SITE_URL}${path}`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 }
        : null
    }),
  )

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...cmsPages.filter(Boolean)]
}
