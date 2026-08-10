'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import Icon from '@/components/Icon.jsx'
import { ToastProvider } from '@/components/admin/toast.jsx'
import { isAuthed, clearToken } from '@/lib/adminApi'
import { ADMIN_THEMES, useAdminTheme } from '@/lib/adminTheme'

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: 'grid', exact: true },
  { href: '/admin/orders', label: 'Orders', icon: 'bag' },
  { href: '/admin/customers', label: 'Customers', icon: 'user' },
  { href: '/admin/notifications', label: 'Notifications', icon: 'bell' },
  { href: '/admin/homepage', label: 'Homepage', icon: 'image' },
  { href: '/admin/popup', label: 'Promotions popup', icon: 'star' },
  { href: '/admin/spin', label: 'Daily spin', icon: 'wheel' },
  { href: '/admin/loyalty', label: 'AS Points', icon: 'star' },
  { href: '/admin/products', label: 'Products', icon: 'box' },
  { href: '/admin/sales', label: 'Sales', icon: 'percent' },
  { href: '/admin/categories', label: 'Categories', icon: 'tag' },
  { href: '/admin/brands', label: 'Brands', icon: 'bookmark' },
  { href: '/admin/import', label: 'Import', icon: 'download' },
  { href: '/admin/pages', label: 'Pages', icon: 'file' },
  { href: '/admin/settings', label: 'Settings', icon: 'cog' },
]

export default function AdminLayout({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const isLogin = pathname === '/admin/login'
  const [ready, setReady] = useState(false)
  const [drawer, setDrawer] = useState(false)
  // Hooks must run on every render, including the login screen and the
  // pre-auth loading state, so this sits above the early returns below.
  const { theme, setTheme } = useAdminTheme()

  // Client-side auth guard (the API is the real gate; this is UX).
  useEffect(() => {
    if (isLogin) {
      setReady(true)
      return
    }
    if (!isAuthed()) {
      router.replace('/admin/login')
      return
    }
    setReady(true)
  }, [isLogin, pathname, router])

  useEffect(() => setDrawer(false), [pathname])

  if (isLogin) return <ToastProvider>{children}</ToastProvider>

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-admin-bg text-admin-text/50">
        Loading…
      </div>
    )
  }

  const logout = () => {
    clearToken()
    router.replace('/admin/login')
  }

  const title = NAV.find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href)))?.label || 'Admin'

  return (
    <ToastProvider>
      <div className="min-h-screen bg-admin-bg lg:flex">
        {/* Sidebar */}
        <Sidebar pathname={pathname} onLogout={logout} drawer={drawer} setDrawer={setDrawer} />

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-admin-line/10 bg-admin-surface/80 px-4 backdrop-blur">
            <button
              onClick={() => setDrawer(true)}
              className="rounded-lg p-2 text-admin-text/70 hover:bg-admin-bg lg:hidden"
              aria-label="Menu"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-admin-text">{title}</h1>
            <div className="ml-auto flex items-center gap-2">
              <ThemePicker theme={theme} setTheme={setTheme} />
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-admin-text/70 hover:bg-admin-bg sm:inline-flex"
              >
                View store ↗
              </a>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-admin-text/70 hover:bg-admin-bg"
              >
                <Icon name="logout" className="h-4 w-4" /> Sign out
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  )
}

function Sidebar({ pathname, onLogout, drawer, setDrawer }) {
  const inner = (
    <div className="flex h-full flex-col bg-admin-invert text-white">
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-5">
        <span className="rounded bg-white/95 px-1.5 py-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/as-store-logo.webp" alt="AS Store" width={300} height={200} className="h-5 w-auto" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-widest text-white/50">CMS</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((n) => {
          const active = n.exact ? pathname === n.href : pathname.startsWith(n.href)
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active ? 'bg-as-red text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon name={n.icon} className="h-5 w-5" />
              {n.label}
            </Link>
          )
        })}
      </nav>
      <button
        onClick={onLogout}
        className="m-3 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white"
      >
        <Icon name="logout" className="h-5 w-5" /> Sign out
      </button>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-64 shrink-0 lg:block">{inner}</aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="absolute left-0 top-0 h-full w-64">{inner}</div>
        </div>
      )}
    </>
  )
}

// Segmented control in the topbar. Labels collapse to icons on small screens so
// the control never crowds the page title.
function ThemePicker({ theme, setTheme }) {
  return (
    <div
      role="radiogroup"
      aria-label="Admin theme"
      className="flex items-center gap-0.5 rounded-lg border border-admin-line/10 p-0.5"
    >
      {ADMIN_THEMES.map((t) => {
        const active = theme === t.value
        return (
          <button
            key={t.value}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(t.value)}
            title={t.hint}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition sm:px-2.5 ${
              active
                ? 'bg-admin-invert text-white'
                : 'text-admin-text/55 hover:bg-admin-bg hover:text-admin-text'
            }`}
          >
            <Icon name={t.icon} className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
