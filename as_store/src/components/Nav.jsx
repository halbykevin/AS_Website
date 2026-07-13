'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSelector, useDispatch } from 'react-redux'
import { AnimatePresence, motion } from 'framer-motion'
import Icon from './Icon.jsx'
import SearchBox from './SearchBox.jsx'
import { selectCartCount } from '@/store/cartSlice'
import { openCart } from '@/store/uiSlice'
import { useAccount } from '@/lib/account'
import { defaultSettings } from '@/lib/site'

// Renders an internal link with <Link> (instant client nav) and external/hash
// links with <a>.
function NavItem({ href = '#', className, onClick, children }) {
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={className} onClick={onClick}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  )
}

// Builds the nav menu: a built-in "Shop" (the all-products page), then only the
// categories explicitly flagged "Show in menu" (curated in the Categories
// admin, ordered by their sort), then any custom links from Settings — minus
// ones that duplicate a category, Shop, or just point home (the logo already
// does). Categories appear in the menu only when you toggle them on.
function buildNavLinks(categories, settings) {
  const cats = Array.isArray(categories) ? categories : []
  // Map each parent id → its subcategories (for the dropdown).
  const childrenByParent = new Map()
  for (const c of cats) {
    if (c.parentId) {
      if (!childrenByParent.has(c.parentId)) childrenByParent.set(c.parentId, [])
      childrenByParent.get(c.parentId).push(c)
    }
  }
  const catLinks = cats
    .filter((c) => c.showInNav)
    .map((c) => ({
      label: c.name,
      href: `/category/${c.slug}`,
      children: (childrenByParent.get(c.id) || []).map((ch) => ({
        label: ch.name,
        href: `/category/${ch.slug}`,
      })),
    }))

  const catNames = new Set(catLinks.map((l) => l.label.toLowerCase()))
  const custom = (settings?.navLinks?.length ? settings.navLinks : defaultSettings.navLinks).filter(
    (l) => l?.label && l.href !== '/' && l.href !== '/shop' && !catNames.has(l.label.toLowerCase()),
  )

  return [{ label: 'Shop', href: '/shop', children: [] }, ...catLinks, ...custom]
}

// Apple-style global nav: optional announcement bar, slim translucent-dark bar
// with a category-driven menu, full-screen mobile menu.
export default function Nav({ settings, categories = [] }) {
  const links = buildNavLinks(categories, settings)
  const announcement = settings?.announcement
  const logoSize = Number(settings?.navLogoSize) || 20
  const count = useSelector(selectCartCount)
  const dispatch = useDispatch()
  const account = useAccount()
  const customer = account?.customer
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {announcement?.enabled && announcement.text && (
        <div className="bg-as-red px-4 py-1.5 text-center text-[12px] font-medium text-white">
          {announcement.text}
        </div>
      )}

      <div className="border-b border-white/10 bg-black/80 backdrop-blur-xl backdrop-saturate-150">
        <nav className="shell-wide flex min-h-[48px] items-center justify-between py-1">
          <Link href="/" className="flex items-center" aria-label="AS Store">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/as-store-logo.webp" alt="AS Store" width={300} height={200} style={{ height: `${logoSize}px` }} className="w-auto" />
          </Link>

          <ul className="hidden items-center gap-7 lg:flex">
            {links.map((l, i) => (
              <li key={`${l.href}-${i}`} className="group relative">
                <NavItem
                  href={l.href}
                  className="flex items-center gap-1 text-[12px] text-white/80 transition-colors hover:text-white"
                >
                  {l.label}
                  {l.children?.length > 0 && (
                    <Icon name="chevronDown" className="h-3 w-3 text-white/40 transition group-hover:text-white/70" />
                  )}
                </NavItem>
                {l.children?.length > 0 && (
                  // pt-3 bridges the gap so hover survives moving onto the menu
                  <div className="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3 opacity-0 transition duration-150 group-hover:visible group-hover:opacity-100">
                    <ul className="min-w-[200px] rounded-xl border border-white/10 bg-black/90 p-2 shadow-xl backdrop-blur-xl">
                      {l.children.map((ch) => (
                        <li key={ch.href}>
                          <Link
                            href={ch.href}
                            className="block whitespace-nowrap rounded-lg px-3 py-2 text-[13px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            {ch.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-5 text-white/80">
            <button onClick={() => setSearchOpen(true)} className="transition-colors hover:text-white" aria-label="Search">
              <Icon name="search" className="h-[18px] w-[18px]" />
            </button>
            <Link
              href={customer ? '/account' : '/login'}
              className="transition-colors hover:text-white"
              aria-label={customer ? 'Your account' : 'Sign in'}
            >
              <Icon name="user" className="h-[18px] w-[18px]" />
            </Link>
            <button
              onClick={() => dispatch(openCart())}
              className="relative transition-colors hover:text-white"
              aria-label={`Bag, ${count} items`}
            >
              <Icon name="bag" className="h-[18px] w-[18px]" />
              {count > 0 && (
                <span className="absolute -right-2 -top-1.5 min-w-[15px] rounded-full bg-as-red px-1 text-center text-[9px] font-bold leading-[15px] text-white">
                  {count}
                </span>
              )}
            </button>
            <button onClick={() => setOpen(true)} className="transition-colors hover:text-white lg:hidden" aria-label="Menu">
              <Icon name="menu" className="h-[18px] w-[18px]" />
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile full-screen menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="shell-wide flex min-h-[48px] items-center justify-between py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/as-store-logo.webp" alt="AS Store" width={300} height={200} style={{ height: `${logoSize}px` }} className="w-auto" />
              <button onClick={() => setOpen(false)} className="text-white" aria-label="Close menu">
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <motion.ul
              className="shell-wide mt-8 space-y-1"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } }}
            >
              {links.map((l, i) => (
                <motion.li
                  key={`${l.href}-${i}`}
                  variants={{ hidden: { opacity: 0, x: -24 }, show: { opacity: 1, x: 0 } }}
                  transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
                >
                  <NavItem
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between border-b border-white/10 py-3 text-2xl font-semibold tracking-apple text-white"
                  >
                    {l.label}
                    <Icon name="chevronRight" className="h-5 w-5 text-white/40" />
                  </NavItem>
                  {l.children?.length > 0 && (
                    <ul className="mb-2 space-y-0.5 pl-4">
                      {l.children.map((ch) => (
                        <li key={ch.href}>
                          <Link
                            href={ch.href}
                            onClick={() => setOpen(false)}
                            className="block py-2 text-base text-white/60 transition-colors hover:text-white"
                          >
                            {ch.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.li>
              ))}
              <motion.li
                variants={{ hidden: { opacity: 0, x: -24 }, show: { opacity: 1, x: 0 } }}
                transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
              >
                <NavItem
                  href={customer ? '/account' : '/login'}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between border-b border-white/10 py-3 text-2xl font-semibold tracking-apple text-white"
                >
                  {customer ? 'Your account' : 'Sign in'}
                  <Icon name="chevronRight" className="h-5 w-5 text-white/40" />
                </NavItem>
              </motion.li>
            </motion.ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search overlay */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            className="fixed inset-0 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setSearchOpen(false)} />
            <motion.div
              className="absolute inset-x-0 top-0 bg-white p-4 shadow-lg"
              initial={{ y: -24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -24, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <div className="shell-wide flex items-center gap-3">
                <SearchBox big autoFocus suggest className="flex-1" onSubmit={() => setSearchOpen(false)} />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="rounded-lg p-2 text-as-ink/50 hover:bg-as-fog hover:text-as-ink"
                  aria-label="Close search"
                >
                  <Icon name="close" className="h-5 w-5" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
