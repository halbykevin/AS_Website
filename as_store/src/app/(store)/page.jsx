import VelocityBand from '@/components/home/VelocityBand.jsx'
import CategoryWall from '@/components/home/CategoryWall.jsx'
import SaleSpotlight from '@/components/home/SaleSpotlight.jsx'
import FreshDrops from '@/components/home/FreshDrops.jsx'
import FinaleCta from '@/components/home/FinaleCta.jsx'
import { loadAllProducts, loadCategories } from '@/lib/catalog'
import { loadSettings } from '@/lib/site'

// Picks the products for the admin-controlled "New arrivals" section based on
// its source: newest (by id desc), featured, or a chosen category.
function pickArrivals(withImage, homeNew, categories) {
  const count = Math.max(1, Number(homeNew?.count) || 8)
  if (homeNew?.source === 'featured') {
    return withImage.filter((p) => p.featured).slice(0, count)
  }
  if (homeNew?.source === 'category' && homeNew.categoryId) {
    const cat = categories.find((c) => String(c.id) === String(homeNew.categoryId))
    const inCat = withImage.filter(
      (p) => String(p.categoryId) === String(homeNew.categoryId) || (cat && p.categorySlug === cat.slug),
    )
    return inCat.slice(0, count)
  }
  // newest (default)
  return [...withImage].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0)).slice(0, count)
}

// The "See all" link target for each arrivals source.
function arrivalsSeeAll(homeNew, categories) {
  if (homeNew?.source === 'featured') return { href: '/shop', label: 'Shop all products' }
  if (homeNew?.source === 'category' && homeNew.categoryId) {
    const cat = categories.find((c) => String(c.id) === String(homeNew.categoryId))
    if (cat) return { href: `/category/${cat.slug}`, label: `See all ${cat.name}` }
  }
  return { href: '/shop?sort=newest', label: 'See all new arrivals' }
}

// AS Store homepage — a scroll-choreographed experience (framer-motion for
// scroll-linked + entrance moves; continuous loops are CSS keyframes) built from
// the live catalog: an admin-controlled "New arrivals" section, velocity
// marquee, category wall, sale spotlight (only when the sales engine has live
// discounts), newest arrivals, and a scaling finale.
export default async function HomePage() {
  const [products, categories, settings] = await Promise.all([
    loadAllProducts(),
    loadCategories(),
    loadSettings(),
  ])

  const withImage = products.filter((p) => p.image)

  const onSale = withImage.filter((p) => p.oldPrice && Number(p.oldPrice) > Number(p.price))
  const maxPercent = onSale.reduce(
    (m, p) => Math.max(m, p.salePercent || Math.round((1 - p.price / p.oldPrice) * 100)),
    0,
  )

  const newest = [...withImage].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0)).slice(0, 8)

  // First block: admin-controlled arrivals strip (replaces the old hero).
  const homeNew = settings?.homeNew || {}
  const arrivals = homeNew.enabled === false ? [] : pickArrivals(withImage, homeNew, categories)
  const seeAll = arrivalsSeeAll(homeNew, categories)

  return (
    <>
      {arrivals.length > 0 && (
        <FreshDrops
          products={arrivals}
          eyebrow={homeNew.eyebrow ?? 'Just landed'}
          heading={homeNew.heading || 'New in.'}
          seeAllHref={seeAll.href}
          seeAllLabel={seeAll.label}
          first
        />
      )}
      <VelocityBand />
      <CategoryWall categories={categories.slice(0, 6)} />
      <SaleSpotlight products={onSale.slice(0, 8)} maxPercent={maxPercent} />
      <FreshDrops products={newest} />
      <FinaleCta />
    </>
  )
}
