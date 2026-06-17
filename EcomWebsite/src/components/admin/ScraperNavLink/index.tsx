'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Adds a "Product Sync" entry to the admin sidebar nav. */
export const ScraperNavLink: React.FC = () => {
  const pathname = usePathname()
  const active = pathname?.endsWith('/admin/scraper')
  return (
    <Link
      href="/admin/scraper"
      className="nav__link"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 0',
        fontWeight: active ? 600 : undefined,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <polyline points="21 3 21 9 15 9" />
      </svg>
      Product Sync
    </Link>
  )
}
