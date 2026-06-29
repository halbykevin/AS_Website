import { Suspense } from 'react'
import ProductTile from '@/components/ProductTile.jsx'
import ProductFilters from '@/components/ProductFilters.jsx'
import SearchBox from '@/components/SearchBox.jsx'
import { searchProducts } from '@/lib/catalog'
import { brandFacets, priceBounds, applyFilters, sortProducts, gridClass } from '@/lib/catalogFilters'

export const metadata = { title: 'Search — AS Store' }

export default async function SearchPage({ searchParams }) {
  const q = (searchParams.q || '').trim()
  const all = q ? await searchProducts(q) : []

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
      <div className="shell-wide">
        <div className="mx-auto max-w-xl">
          <SearchBox key={q} big defaultValue={q} />
        </div>

        {!q ? (
          <p className="mt-12 text-center text-as-ink/40">Type something to search the store.</p>
        ) : all.length === 0 ? (
          <p className="mt-12 text-center text-as-ink/50">
            No products found for “{q}”. Try another search.
          </p>
        ) : (
          <>
            <h1 className="mt-8 text-2xl font-semibold tracking-apple text-as-ink sm:text-3xl">
              Results for “{q}”
            </h1>
            <Suspense fallback={<div className="mt-10 h-16" />}>
              <ProductFilters brands={brands} bounds={bounds} total={products.length} />
            </Suspense>
            {products.length > 0 ? (
              <div className={`mt-8 grid gap-5 ${gridClass(searchParams.cols)}`}>
                {products.map((p) => (
                  <ProductTile key={p.id} product={p} fluid />
                ))}
              </div>
            ) : (
              <p className="mt-16 text-center text-as-ink/40">No products match these filters.</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
