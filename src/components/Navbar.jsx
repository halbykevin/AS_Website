import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useContent } from '../store/content.jsx'

export default function Navbar() {
  const { brand, nav } = useContent()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  // 0 = fully hidden, 1 = fully shown. Ramps up as the user scrolls up.
  const [reveal, setReveal] = useState(1)
  const lastY = useRef(0)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    // Pixels of upward scrolling needed to fully reveal the navbar.
    const REVEAL_DISTANCE = 120
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 8)
      const delta = y - lastY.current
      if (y <= 80) {
        // Near the top: always fully visible.
        setReveal(1)
      } else if (delta > 0) {
        // Scrolling down: hide.
        setReveal(0)
      } else if (delta < 0) {
        // Scrolling up: reveal gradually in proportion to the distance scrolled up.
        setReveal((r) => Math.min(1, r + -delta / REVEAL_DISTANCE))
      }
      lastY.current = y
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
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
      style={
        open
          ? undefined
          : {
              opacity: reveal,
              transform: `translateY(${(reveal - 1) * 100}%)`,
              pointerEvents: reveal === 0 ? 'none' : undefined,
            }
      }
      className={`sticky top-0 z-50 transition-[background-color,box-shadow] duration-300 ${
        scrolled
          ? 'border-b border-black/5 bg-white/90 shadow-sm backdrop-blur'
          : 'bg-white/0'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 sm:py-4">
        <Link to="/" className="flex items-center gap-2" aria-label={brand.name}>
          <img
            src={brand.logo}
            alt={brand.name}
            className="h-14 w-auto mix-blend-multiply sm:h-12"
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
