import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ProductTile from '@/components/ProductTile.jsx'
import ProductFilters from '@/components/ProductFilters.jsx'
import Breadcrumbs from '@/components/Breadcrumbs.jsx'
import { loadCategories, loadCategoryProducts } from '@/lib/catalog'
import { brandFacets, priceBounds, applyFilters, sortProducts, gridClass } from '@/lib/catalogFilters'
import { childrenOf, categoryTrail } from '@/lib/categoryTree'
import { metaDescription, breadcrumbJsonLd, jsonLdScript } from '@/lib/seo'

// Title-case a slug as a fallback when the category isn't in the catalog
// (e.g. the API is offline): "smart-home" -> "Smart Home".
const prettify = (slug) =>
  String(slug || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export async function generateMetadata({ params }) {
  const cats = await loadCategories()
  const cat = cats.find((c) => c.slug === params.slug)
  const name = cat?.name || prettify(params.slug)
  const description = metaDescription(
    cat?.tagline,
    `Shop ${name} at AS Store — genuine tech & electronics with fast delivery across Lebanon.`,
  )
  const url = `/category/${params.slug}`
  return {
    title: name,
    description,
    // Canonical drops ?brand/?sort/?sale filter params so filtered views don't
    // compete with the clean category page as duplicate content.
    alternates: { canonical: url },
    openGraph: { title: `${name} — AS Store`, description, url },
  }
}

// Category browse page: the landing spot for a nav/category tile. Lists the
// category's products with a sort + filter bar (driven by URL search params).
export default async function CategoryPage({ params, searchParams }) {
  const { slug } = params
  const [cats, all] = await Promise.all([loadCategories(), loadCategoryProducts(slug)])
  const category = cats.find((c) => c.slug === slug)

  // 404 only when we have a live catalog and the slug genuinely isn't in it.
  // If the API is down (cats empty) we still render from whatever products load.
  if (!category && cats.length) notFound()

  const title = category?.name || prettify(slug)
  const tagline = category?.tagline || ''

  // Subcategories (if this is a parent department) + breadcrumb trail.
  const subcategories = category ? childrenOf(cats, category.id) : []
  const trail = categoryTrail(cats, category)

  // Facets come from the full category set; filtering/sorting from the URL.
  const brands = brandFacets(all)
  const bounds = priceBounds(all)
  const filtered = applyFilters(all, {
    brand: searchParams.brand || '',
    min: searchParams.min ? Number(searchParams.min) : null,
    max: searchParams.max ? Number(searchParams.max) : null,
    sale: searchParams.sale === '1',
  })
  const products = sortProducts(filtered, searchParams.sort || '')

  return (
    <section className="bg-white pb-24 pt-28 sm:pt-32">
      {trail.length > 1 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript(breadcrumbJsonLd(trail.map((t) => ({ name: t.name, url: t.href }))))}
        />
      )}
      <div className="shell-wide">
        <Breadcrumbs items={trail} className="mb-6" />

        <header className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-as-red">AS Store</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">{title}</h1>
          {tagline && <p className="mx-auto mt-3 max-w-xl text-lg text-as-ink/55">{tagline}</p>}
        </header>

        {/* Subcategory tiles — shown when this department has children. */}
        {subcategories.length > 0 && (
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {subcategories.map((sub) => (
              <Link
                key={sub.id}
                href={`/category/${sub.slug}`}
                className="group relative flex aspect-[4/3] items-end overflow-hidden rounded-2xl border border-as-ink/10 bg-as-fog p-4 transition hover:border-as-red hover:shadow-lg"
              >
                {sub.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sub.imageUrl}
                    alt={sub.name}
                    className="absolute inset-0 h-full w-full object-cover opacity-90 transition group-hover:scale-105"
                  />
                )}
                <span
                  className={`relative z-10 text-lg font-semibold tracking-apple ${
                    sub.imageUrl ? 'text-white drop-shadow' : 'text-as-ink'
                  }`}
                >
                  {sub.name}
                </span>
                {sub.imageUrl && <span className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />}
              </Link>
            ))}
          </div>
        )}

        {all.length > 0 && (
          <Suspense fallback={<div className="mt-10 h-16" />}>
            <ProductFilters brands={brands} bounds={bounds} total={products.length} />
          </Suspense>
        )}

        {products.length > 0 ? (
          <div className={`mt-8 grid gap-5 ${gridClass(searchParams.cols)}`}>
            {products.map((p) => (
              <ProductTile key={p.id} product={p} fluid />
            ))}
          </div>
        ) : all.length > 0 ? (
          <p className="mt-16 text-center text-as-ink/40">No products match these filters.</p>
        ) : (
          <p className="mt-16 text-center text-as-ink/40">No products in this category yet.</p>
        )}
      </div>
    </section>
  )
}
