import { Categories } from '@/components/layout/search/Categories'
import { FilterList } from '@/components/layout/search/filter'
import type { SortFilterItem } from '@/lib/constants'
import { Search } from '@/components/Search'
import { getCachedGlobal } from '@/utilities/getGlobals'
import React, { Suspense } from 'react'

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const shop = await getCachedGlobal('shopSettings', 0)()
  const options = shop?.sortOptions?.length
    ? shop.sortOptions
    : [{ label: 'Alphabetic A-Z', value: '' }]

  const sorting: SortFilterItem[] = options.map((o) => ({
    title: o.label,
    slug: o.value || null,
    reverse: Boolean(o.value && o.value.startsWith('-')),
  }))

  return (
    <Suspense fallback={null}>
      <div className="container flex flex-col gap-8 my-16 pb-4 ">
        <Search className="mb-8" />

        <div className="flex flex-col md:flex-row items-start justify-between gap-16 md:gap-4">
          <div className="w-full flex-none flex flex-col gap-4 md:gap-8 basis-1/5">
            <Categories />
            <FilterList list={sorting} title="Sort by" />
          </div>
          <div className="min-h-screen w-full">{children}</div>
        </div>
      </div>
    </Suspense>
  )
}
