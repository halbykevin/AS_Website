import Link from 'next/link'
import Brand from './Brand'

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/[0.07] bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-2.5 sm:px-8">
        <Brand />
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
    </header>
  )
}
