import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useContent } from '../store/content.jsx'
import { useScrollEl } from '../store/scroll.jsx'

export default function Navbar() {
  const { brand, nav } = useContent()
  const scrollRef = useScrollEl()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const el = scrollRef?.current
    if (!el) return
    const onScroll = () => {
      const y = el.scrollTop
      setScrolled(y > 8)
      const delta = y - lastY.current
      if (y <= 80) {
        // Near the top: always show.
        setHidden(false)
      } else if (delta > 4) {
        // Scrolling down: hide.
        setHidden(true)
      } else if (delta < -4) {
        // Scrolling up: show.
        setHidden(false)
      }
      lastY.current = y
    }
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

  // Hide by collapsing the header's row to zero height, so the content area
  // below (and its scrollbar) expands right up to the top edge.
  const collapsed = hidden && !open

  return (
    <div
      className={`relative z-50 grid transition-[grid-template-rows] duration-300 ease-out ${
        collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
      }`}
    >
      <header
        className={`min-h-0 overflow-hidden transition-[background-color,box-shadow] duration-300 ${
          scrolled
            ? 'border-b border-black/5 bg-white/90 shadow-sm backdrop-blur'
            : 'bg-white'
        }`}
      >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 sm:py-4">
        <Link to="/" className="flex items-center gap-2" aria-label={brand.name}>
          <img
            src={brand.logo}
            alt={brand.name}
            width="84"
            height="56"
            fetchpriority="high"
            decoding="async"
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
