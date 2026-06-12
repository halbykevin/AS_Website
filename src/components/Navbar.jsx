import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { brand, nav } from '../content/site.js'

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the mobile menu whenever the route changes.
  useEffect(() => setOpen(false), [location.pathname])

  // Smoothly handle "/#section" links across routes.
  const handleNavClick = (e, href) => {
    if (!href.includes('#')) return
    e.preventDefault()
    const [path, hash] = href.split('#')
    const scrollToHash = () => {
      const el = document.getElementById(hash)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
    if (location.pathname === (path || '/')) {
      scrollToHash()
    } else {
      navigate(path || '/')
      setTimeout(scrollToHash, 100)
    }
    setOpen(false)
  }

  return (
    <header
      className={`sticky top-0 z-50 transition-all ${
        scrolled
          ? 'border-b border-black/5 bg-white/90 backdrop-blur'
          : 'bg-white/0'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
        <Link to="/" className="flex items-center gap-2" aria-label={brand.name}>
          <img
            src={brand.logo}
            alt={brand.name}
            className="h-10 w-auto mix-blend-multiply sm:h-12"
          />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 md:flex">
          {nav.map((item) =>
            item.href.includes('#') ? (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className="text-sm font-medium text-as-charcoal/70 transition hover:text-as-red"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.label}
                to={item.href}
                className="text-sm font-medium text-as-charcoal/70 transition hover:text-as-red"
              >
                {item.label}
              </Link>
            )
          )}
          <Link
            to="/events"
            className="rounded-full bg-as-red px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light hover:shadow-md"
          >
            Browse Events
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-as-charcoal md:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-black/5 bg-white md:hidden">
          <div className="flex flex-col gap-1 px-5 py-3">
            {nav.map((item) =>
              item.href.includes('#') ? (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item.href)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-as-charcoal/80 transition hover:bg-as-red/5 hover:text-as-red"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  to={item.href}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-as-charcoal/80 transition hover:bg-as-red/5 hover:text-as-red"
                >
                  {item.label}
                </Link>
              )
            )}
            <Link
              to="/events"
              className="mt-2 rounded-full bg-as-red px-5 py-2.5 text-center text-sm font-semibold text-white"
            >
              Browse Events
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
