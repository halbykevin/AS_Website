import { notFound } from 'next/navigation'
import ProductTile from '@/components/ProductTile.jsx'
import { loadCategories, loadCategoryProducts } from '@/lib/catalog'

// Title-case a slug as a fallback when the category isn't in the catalog
// (e.g. the API is offline): "smart-home" -> "Smart Home".
const prettify = (slug) =>
  String(slug || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export async function generateMetadata({ params }) {
  const cats = await loadCategories()
  const cat = cats.find((c) => c.slug === params.slug)
  return { title: `${cat?.name || prettify(params.slug)} — AS Store` }
}

// Category browse page: the landing spot for a nav/category tile. Lists every
// visible product in the category in a responsive grid.
export default async function CategoryPage({ params }) {
  const { slug } = params
  const [cats, products] = await Promise.all([loadCategories(), loadCategoryProducts(slug)])
  const category = cats.find((c) => c.slug === slug)

  // 404 only when we have a live catalog and the slug genuinely isn't in it.
  // If the API is down (cats empty) we still render from whatever products load.
  if (!category && cats.length) notFound()

  const title = category?.name || prettify(slug)
  const tagline = category?.tagline || ''

  return (
    <section className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="shell-wide">
        <header className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-as-red">AS Store</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">
            {title}
          </h1>
          {tagline && <p className="mx-auto mt-3 max-w-xl text-lg text-as-ink/55">{tagline}</p>}
        </header>

        {products.length > 0 ? (
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <ProductTile key={p.id} product={p} fluid />
            ))}
          </div>
        ) : (
          <p className="mt-16 text-center text-as-ink/40">No products in this category yet.</p>
        )}
      </div>
    </section>
  )
}
