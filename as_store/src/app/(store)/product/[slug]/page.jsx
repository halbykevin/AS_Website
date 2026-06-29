import { notFound } from 'next/navigation'
import ProductDetail from '@/components/ProductDetail.jsx'
import ProductTile from '@/components/ProductTile.jsx'
import { loadProduct, loadCategoryProducts } from '@/lib/catalog'

export async function generateMetadata({ params }) {
  const product = await loadProduct(params.slug)
  return { title: product ? `${product.name} — AS Store` : 'AS Store' }
}

// Single product page: gallery + buy box, then related products from the same
// category.
export default async function ProductPage({ params }) {
  const product = await loadProduct(params.slug)
  if (!product) notFound()

  const related = product.categorySlug
    ? (await loadCategoryProducts(product.categorySlug)).filter((p) => p.slug !== product.slug).slice(0, 4)
    : []

  return (
    <>
      <ProductDetail product={product} />

      {related.length > 0 && (
        <section className="bg-white pb-24">
          <div className="shell-wide">
            <h2 className="mb-8 text-2xl font-semibold tracking-apple text-as-ink sm:text-3xl">
              You may also like
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((p) => (
                <ProductTile key={p.id} product={p} fluid />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
