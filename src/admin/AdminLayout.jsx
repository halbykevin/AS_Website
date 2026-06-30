import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.js'

const links = [
  { to: '/admin', label: 'Site Settings', end: true },
  { to: '/admin/banners', label: 'Banners' },
  { to: '/admin/sections', label: 'Custom Sections' },
  { to: '/admin/services', label: 'Services' },
  { to: '/admin/what-we-do', label: 'What We Do' },
  { to: '/admin/events', label: 'Events' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/store', label: 'AS Store Showcase' },
  { to: '/admin/story', label: 'Scroll Story' },
  { to: '/admin/popup', label: 'Popup' },
  { to: '/admin/predictor', label: 'World Cup Predictor' },
  { to: '/admin/scraper', label: 'Web Scraper' },
]

export default function AdminLayout() {
  const { admin, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/admin/login', { replace: true })
  }

  const navItems = (
    <nav className="flex flex-col gap-1">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? 'bg-as-red/10 text-as-red'
                : 'text-as-charcoal/70 hover:bg-black/5 hover:text-as-charcoal'
            }`
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen bg-as-charcoal/[0.03]">
      {/* Topbar */}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-as-charcoal md:hidden"
              aria-label="Toggle menu"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <img src="/ASCompanyLogo.jpg" alt="AS Company" className="h-8 w-auto mix-blend-multiply" />
            <span className="text-sm font-semibold text-as-charcoal">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/?preview=1" target="_blank" className="hidden text-sm font-medium text-as-charcoal/60 hover:text-as-red sm:inline">
              Preview site ↗
            </Link>
            <span className="hidden text-sm text-as-charcoal/45 lg:inline">{admin?.email}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-semibold text-as-charcoal transition hover:border-as-red/30 hover:text-as-red"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 sm:px-6">
        {/* Sidebar (desktop) */}
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-20">{navItems}</div>
        </aside>

        {/* Sidebar (mobile) */}
        {open && (
          <div className="fixed inset-0 z-20 md:hidden" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute left-0 top-14 w-60 bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              {navItems}
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
