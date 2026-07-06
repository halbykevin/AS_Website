import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useContent } from '../store/content.jsx'
import { useScrollEl } from '../store/scroll.jsx'
import { useLenis } from '../store/lenis.jsx'
import FootballButton from './predictor/FootballButton.jsx'

export default function Navbar() {
  const { brand, nav } = useContent()
  const logoH = Number(brand.logoSize) || 48
  const scrollRef = useScrollEl()
  const lenis = useLenis()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  // The header is always visible (it lives outside the scroll area). We only
  // track whether the page has scrolled, to add the subtle background + shadow.
  useEffect(() => {
    const el = scrollRef?.current
    if (!el) return
    const onScroll = () => setScrolled(el.scrollTop > 8)
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef])

  // Close the mobile menu whenever the route changes.
  useEffect(() => setOpen(false), [location.pathname])

  // Smoothly handle "/#section" links across routes.
  const handleNavClick = (e, href) => {
    if (!href.includes('#')) return
    e.preventDefault()
    const [path, hash] = href.split('#')
    const scrollToHash = () => {
      const el = document.getElementById(hash)
      if (!el) return
      if (lenis) lenis.scrollTo(el, { offset: -8 })
      else el.scrollIntoView({ behavior: 'smooth' })
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
    <div className="relative z-50">
      <header
        className={`transition-[box-shadow] duration-300 ${
          scrolled ? 'border-b border-black/5 bg-white shadow-sm' : 'bg-white'
        }`}
      >
      <nav className="relative mx-auto flex max-w-7xl items-center justify-between px-5 py-1.5 sm:px-8 sm:py-2">
        {/* Animated football — opens the World Cup predictor (hidden unless enabled) */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-[30%]">
          <div className="pointer-events-auto">
            <FootballButton />
          </div>
        </div>

        <Link to="/" className="flex items-center gap-2" aria-label={brand.name}>
          <img
            src={brand.logo}
            alt={brand.name}
            fetchpriority="high"
            decoding="async"
            className="w-auto mix-blend-multiply"
            style={{ height: `${logoH}px` }}
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

      {/* Mobile menu — always rendered, animates open via grid-rows height + fade */}
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out md:hidden ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className={`min-h-0 overflow-hidden border-t border-black/5 bg-white transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}>
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
      </div>
      </header>
    </div>
  )
}
