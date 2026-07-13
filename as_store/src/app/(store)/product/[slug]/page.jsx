import { notFound } from 'next/navigation'
import ProductDetail from '@/components/ProductDetail.jsx'
import ProductTile from '@/components/ProductTile.jsx'
import { loadProduct, loadCategoryProducts, loadCategories } from '@/lib/catalog'
import { loadSettings } from '@/lib/site'
import { findBySlug, categoryTrail } from '@/lib/categoryTree'
import {
  metaDescription,
  productJsonLd,
  breadcrumbJsonLd,
  jsonLdScript,
  DEFAULT_OG_IMAGE,
} from '@/lib/seo'

export async function generateMetadata({ params }) {
  const product = await loadProduct(params.slug)
  if (!product) return { title: 'Product not found' }

  const description = metaDescription(
    product.description || product.tagline,
    `${product.name}${product.brand ? ` by ${product.brand}` : ''} — available at AS Store with fast delivery across Lebanon.`,
  )
  const url = `/product/${product.slug}`
  const image = product.image || (product.images && product.images[0]) || DEFAULT_OG_IMAGE

  return {
    title: product.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: `${product.name} — AS Store`,
      description,
      url,
      images: [{ url: image, alt: product.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} — AS Store`,
      description,
      images: [image],
    },
  }
}

// Single product page: gallery + buy box, then related products from the same
// category.
export default async function ProductPage({ params }) {
  const [product, settings, cats] = await Promise.all([
    loadProduct(params.slug),
    loadSettings(),
    loadCategories(),
  ])
  if (!product) notFound()

  const related = product.categorySlug
    ? (await loadCategoryProducts(product.categorySlug)).filter((p) => p.slug !== product.slug).slice(0, 4)
    : []

  // Full trail Home → [parent] → category → product (parent resolved from the
  // category tree so subcategory products show their department too).
  const leaf = product.categorySlug ? findBySlug(cats, product.categorySlug) : null
  const trail = [
    ...(leaf
      ? categoryTrail(cats, leaf)
      : [
          { name: 'Home', href: '/' },
          ...(product.categorySlug
            ? [{ name: product.category || product.categorySlug, href: `/category/${product.categorySlug}` }]
            : []),
        ]),
    { name: product.name, href: `/product/${product.slug}` },
  ]
  const breadcrumb = breadcrumbJsonLd(trail.map((t) => ({ name: t.name, url: t.href })))

  return (
    <>
      {/* Product rich-result schema (price/availability) + breadcrumb trail */}
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(productJsonLd(product))} />
      {breadcrumb && (
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumb)} />
      )}

      <ProductDetail product={product} whatsapp={settings?.contact?.whatsapp} breadcrumb={trail} />

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
