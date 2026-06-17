import { Grid } from '@/components/Grid'
import { ProductGridItem } from '@/components/ProductGridItem'
import { getCachedGlobal } from '@/utilities/getGlobals'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'

export async function generateMetadata() {
  const shop = await getCachedGlobal('shopSettings', 1)()
  const image =
    shop?.meta?.image && typeof shop.meta.image === 'object' ? shop.meta.image.url : undefined
  return {
    title: shop?.meta?.title || shop?.title || 'Shop',
    description: shop?.meta?.description || 'Search for products in the store.',
    ...(image ? { openGraph: { images: [image] } } : {}),
  }
}

type SearchParams = { [key: string]: string | string[] | undefined }
type Props = { searchParams: Promise<SearchParams> }

const productSelect = {
  title: true,
  slug: true,
  gallery: true,
  categories: true,
  priceInUSD: true,
} as const

export default async function ShopPage({ searchParams }: Props) {
  const { q: searchValue, sort, category } = await searchParams
  const payload = await getPayload({ config: configPromise })
  const shop = await getCachedGlobal('shopSettings', 0)()

  const products = await payload.find({
    collection: 'products',
    draft: false,
    overrideAccess: false,
    select: productSelect,
    ...(sort ? { sort } : { sort: 'title' }),
    ...(searchValue || category
      ? {
          where: {
            and: [
              { _status: { equals: 'published' } },
              ...(searchValue
                ? [
                    {
                      or: [
                        { title: { like: searchValue } },
                        { description: { like: searchValue } },
                      ],
                    },
                  ]
                : []),
              ...(category ? [{ categories: { contains: category } }] : []),
            ],
          },
        }
      : {}),
  })

  // Featured products pinned to the top — only on the unfiltered shop view.
  const featuredIds = (shop?.featuredProducts || []).map((p) =>
    typeof p === 'object' ? p.id : p,
  )
  let display = products.docs
  if (!searchValue && !category && featuredIds.length) {
    const featured = await payload.find({
      collection: 'products',
      draft: false,
      overrideAccess: false,
      select: productSelect,
      where: { id: { in: featuredIds } },
      limit: featuredIds.length,
    })
    const ordered = featuredIds
      .map((id) => featured.docs.find((d) => d.id === id))
      .filter((d): d is (typeof featured.docs)[number] => Boolean(d))
    const rest = products.docs.filter((d) => !featuredIds.includes(d.id))
    display = [...ordered, ...rest]
  }

  const resultsText = display.length > 1 ? 'results' : 'result'

  return (
    <div>
      {!searchValue && (shop?.title || shop?.intro) ? (
        <div className="mb-8">
          {shop?.title ? <h1 className="text-2xl font-semibold">{shop.title}</h1> : null}
          {shop?.intro ? (
            <p className="mt-2 text-neutral-500 dark:text-neutral-400">{shop.intro}</p>
          ) : null}
        </div>
      ) : null}

      {searchValue ? (
        <p className="mb-4">
          {display.length === 0
            ? 'There are no products that match '
            : `Showing ${display.length} ${resultsText} for `}
          <span className="font-bold">&quot;{searchValue}&quot;</span>
        </p>
      ) : null}

      {!searchValue && display.length === 0 && (
        <p className="mb-4">No products found. Please try different filters.</p>
      )}

      {display.length > 0 ? (
        <Grid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {display.map((product) => {
            return <ProductGridItem key={product.id} product={product} />
          })}
        </Grid>
      ) : null}
    </div>
  )
}
