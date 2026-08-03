import { Suspense } from 'react'
import ProductTile from '@/components/ProductTile.jsx'
import ProductFilters from '@/components/ProductFilters.jsx'
import Pagination from '@/components/Pagination.jsx'
import { loadAllProducts } from '@/lib/catalog'
import {
  categoryFacets,
  brandFacets,
  priceBounds,
  applyFilters,
  sortProducts,
  paginate,
  gridClass,
  tileLayout,
} from '@/lib/catalogFilters'

export const metadata = {
  title: 'Shop Tech & Electronics in Lebanon — All Products',
  description:
    'Buy tech & electronics online in Lebanon — laptops, smartphones, audio, gaming, smart home and accessories. Genuine products, cash on delivery, fast delivery across Lebanon.',
  alternates: { canonical: '/shop' },
}

// The whole catalog on one browsable page: same sort/filter bar as a category
// page, plus a category facet since the list spans everything.
export default async function ShopPage({ searchParams }) {
  searchParams = await searchParams
  const all = await loadAllProducts()

  const categories = categoryFacets(all)
  const brands = brandFacets(all)
  const bounds = priceBounds(all)
  const filtered = applyFilters(all, {
    cat: searchParams.cat || '',
    brand: searchParams.brand || '',
    min: searchParams.min ? Number(searchParams.min) : null,
    max: searchParams.max ? Number(searchParams.max) : null,
    sale: searchParams.sale === '1',
  })
  const products = sortProducts(filtered, searchParams.sort || '')
  const { items, page, totalPages } = paginate(products, searchParams.page)

  return (
    <section className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="shell-wide">
        <header className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-as-red">AS Store</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">
            Shop all products
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-lg text-as-ink/55">
            Everything in the store, in one place.
          </p>
        </header>

        {all.length > 0 && (
          <Suspense fallback={<div className="mt-10 h-16" />}>
            <ProductFilters categories={categories} brands={brands} bounds={bounds} total={products.length} />
          </Suspense>
        )}

        {products.length > 0 ? (
          <>
            <div className={`mt-8 grid gap-5 ${gridClass(searchParams.cols)}`}>
              {items.map((p) => (
                <ProductTile key={p.id} product={p} fluid layout={tileLayout(searchParams.cols)} />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} basePath="/shop" searchParams={searchParams} />
          </>
        ) : all.length > 0 ? (
          <p className="mt-16 text-center text-as-ink/40">No products match these filters.</p>
        ) : (
          <p className="mt-16 text-center text-as-ink/40">No products in the store yet.</p>
        )}
      </div>
    </section>
  )
}
