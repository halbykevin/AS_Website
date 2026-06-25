'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSelector } from 'react-redux'
import { AnimatePresence, motion } from 'framer-motion'
import Icon from './Icon.jsx'
import { selectCartCount } from '@/store/cartSlice'
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

// Apple-style global nav: optional announcement bar, slim translucent-dark bar
// with minimal links (from CMS settings), full-screen mobile menu.
export default function Nav({ settings }) {
  const links = settings?.navLinks?.length ? settings.navLinks : defaultSettings.navLinks
  const announcement = settings?.announcement
  const count = useSelector(selectCartCount)
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {announcement?.enabled && announcement.text && (
        <div className="bg-as-red px-4 py-1.5 text-center text-[12px] font-medium text-white">
          {announcement.text}
        </div>
      )}

      <div className="border-b border-white/10 bg-black/80 backdrop-blur-xl backdrop-saturate-150">
        <nav className="shell-wide flex h-12 items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="AS Store">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/as-store-logo.png" alt="AS Store" className="h-5 w-auto" />
          </Link>

          <ul className="hidden items-center gap-7 lg:flex">
            {links.map((l, i) => (
              <li key={`${l.href}-${i}`}>
                <NavItem href={l.href} className="text-[12px] text-white/80 transition-colors hover:text-white">
                  {l.label}
                </NavItem>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-5 text-white/80">
            <button className="transition-colors hover:text-white" aria-label="Search">
              <Icon name="search" className="h-[18px] w-[18px]" />
            </button>
            <a href="#" className="relative transition-colors hover:text-white" aria-label={`Bag, ${count} items`}>
              <Icon name="bag" className="h-[18px] w-[18px]" />
              {count > 0 && (
                <span className="absolute -right-2 -top-1.5 min-w-[15px] rounded-full bg-as-red px-1 text-center text-[9px] font-bold leading-[15px] text-white">
                  {count}
                </span>
              )}
            </a>
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
            <div className="shell-wide flex h-12 items-center justify-between">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/as-store-logo.png" alt="AS Store" className="h-5 w-auto" />
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
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
