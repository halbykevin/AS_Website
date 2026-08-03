import { Suspense } from 'react'
import Link from 'next/link'
import ProductTile from '@/components/ProductTile.jsx'
import ProductFilters from '@/components/ProductFilters.jsx'
import SearchBox from '@/components/SearchBox.jsx'
import Pagination from '@/components/Pagination.jsx'
import Icon from '@/components/Icon.jsx'
import { loadCategories, searchProducts } from '@/lib/catalog'
import { brandFacets, priceBounds, applyFilters, sortProducts, paginate, gridClass, tileLayout } from '@/lib/catalogFilters'

export const metadata = { title: 'Search — AS Store' }

// Categories offered as a way out of an empty result (and as the landing state
// before anything is typed).
function CategoryChips({ categories }) {
  if (!categories.length) return null
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/category/${c.slug}`}
          className="rounded-full border border-as-ink/15 px-4 py-2 text-sm text-as-ink/70 transition-colors hover:border-as-red/40 hover:text-as-red"
        >
          {c.name}
        </Link>
      ))}
    </div>
  )
}

export default async function SearchPage({ searchParams }) {
  searchParams = await searchParams
  const q = (searchParams.q || '').trim()
  const [all, categories] = await Promise.all([q ? searchProducts(q) : [], loadCategories()])
  const topCategories = categories.filter((c) => !c.parentId).slice(0, 8)

  const brands = brandFacets(all)
  const bounds = priceBounds(all)
  const filtered = applyFilters(all, {
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
        <header className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-semibold tracking-apple text-as-ink sm:text-4xl">
            {q ? <>Results for “{q}”</> : 'Search the store'}
          </h1>
          <p className="mt-2 text-[15px] text-as-ink/50">
            {q
              ? `${all.length} product${all.length === 1 ? '' : 's'} matched`
              : 'Find anything by product name, brand or category.'}
          </p>
          <div className="mt-6">
            <SearchBox key={q} big defaultValue={q} autoFocus={!q} />
          </div>
          <p className="mt-3 text-xs text-as-ink/35">
            Tip: press <span className="kbd">/</span> anywhere to search.
          </p>
        </header>

        {!q ? (
          <div className="mx-auto mt-12 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-as-ink/35">
              Browse categories
            </p>
            <CategoryChips categories={topCategories} />
          </div>
        ) : all.length === 0 ? (
          <div className="mx-auto mt-16 max-w-2xl text-center">
            <Icon name="search" className="mx-auto h-10 w-10 text-as-ink/15" />
            <h2 className="mt-4 text-xl font-semibold tracking-apple text-as-ink">
              No products found for “{q}”
            </h2>
            <p className="mx-auto mt-2 max-w-md text-[15px] text-as-ink/50">
              Check the spelling, use fewer words, or search by the brand or category instead.
            </p>
            <CategoryChips categories={topCategories} />
          </div>
        ) : (
          <div className="mt-10">
            <Suspense fallback={<div className="h-16" />}>
              <ProductFilters brands={brands} bounds={bounds} total={products.length} />
            </Suspense>
            {products.length > 0 ? (
              <>
                <div className={`mt-8 grid gap-5 ${gridClass(searchParams.cols)}`}>
                  {items.map((p) => (
                    <ProductTile key={p.id} product={p} fluid layout={tileLayout(searchParams.cols)} />
                  ))}
                </div>
                <Pagination page={page} totalPages={totalPages} basePath="/search" searchParams={searchParams} />
              </>
            ) : (
              <p className="mt-16 text-center text-as-ink/40">
                No products match these filters. Try widening them.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
