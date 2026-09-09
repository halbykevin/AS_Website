import Link from 'next/link'
import Brand from './Brand'
import HeaderSearch from './HeaderSearch'
import { getSearchIndex } from '@/lib/api'

export default async function Header() {
  const index = await getSearchIndex()

  return (
    <header className="sticky top-0 z-40 border-b border-black/[0.07] bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-2.5 sm:gap-5 sm:px-8">
        <Brand />
        <div className="ml-auto flex items-center gap-1 sm:gap-5">
          <HeaderSearch events={index} />
          <nav className="flex items-center gap-4 sm:gap-6">
            <Link
              href="/events"
              className="text-sm font-medium text-as-charcoal/70 transition hover:text-as-red"
            >
              All events
            </Link>
            <a
              href="https://www.as.com.lb"
              className="hidden text-sm font-medium text-as-charcoal/70 transition hover:text-as-red sm:inline"
            >
              AS Company
            </a>
          </nav>
        </div>
      </div>
    </header>
  )
}
