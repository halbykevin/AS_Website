import ReactDOM from 'react-dom'
import HeroCinema from '@/components/home/HeroCinema.jsx'
import VelocityBand from '@/components/home/VelocityBand.jsx'
import CategoryWall from '@/components/home/CategoryWall.jsx'
import SaleSpotlight from '@/components/home/SaleSpotlight.jsx'
import FreshDrops from '@/components/home/FreshDrops.jsx'
import FinaleCta from '@/components/home/FinaleCta.jsx'
import { loadAllProducts, loadCategories } from '@/lib/catalog'
import { loadHomepageSections } from '@/lib/homepage'

// AS Store homepage — a scroll-choreographed experience (Lenis + framer-motion)
// built from the live catalog: cinematic hero (copy still editable via the
// hero block in /admin/homepage), velocity marquee,
// category wall, sale spotlight (only when the sales engine has live
// discounts), newest arrivals, and a scaling finale.
export default async function HomePage() {
  const [products, categories, sections] = await Promise.all([
    loadAllProducts(),
    loadCategories(),
    loadHomepageSections(),
  ])

  const heroCms = sections.find((s) => s.type === 'hero') || null

  const withImage = products.filter((p) => p.image)
  const featured = withImage.filter((p) => p.featured)
  const heroProduct = (featured.length >= 3 ? featured : withImage)[0] || null

  // Preload the hero product image (the LCP element) so it starts downloading
  // immediately with high priority instead of after the JS hydrates.
  if (heroProduct?.image) {
    ReactDOM.preload(heroProduct.image, { as: 'image', fetchPriority: 'high' })
  }

  const onSale = withImage.filter((p) => p.oldPrice && Number(p.oldPrice) > Number(p.price))
  const maxPercent = onSale.reduce(
    (m, p) => Math.max(m, p.salePercent || Math.round((1 - p.price / p.oldPrice) * 100)),
    0,
  )

  const newest = [...withImage].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0)).slice(0, 8)

  return (
    <>
      <HeroCinema cms={heroCms} product={heroProduct} categories={categories} />
      <VelocityBand />
      <CategoryWall categories={categories.slice(0, 6)} />
      <SaleSpotlight products={onSale.slice(0, 8)} maxPercent={maxPercent} />
      <FreshDrops products={newest} />
      <FinaleCta />
    </>
  )
}
