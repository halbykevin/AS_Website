'use client'

// Admin CMS theme. Applies ONLY to /admin — the attribute is written to
// <html> while an admin page is mounted and removed on unmount, so navigating
// to the storefront (client-side or otherwise) never inherits it.

import { useCallback, useEffect, useState } from 'react'

const KEY = 'as_store_admin_theme'

export const ADMIN_THEMES = [
  {
    value: 'light',
    label: 'Light',
    icon: 'eye',
    hint: 'The default bright CMS.',
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: 'eyeOff',
    hint: 'Easier on the eyes at night.',
  },
  {
    value: 'eco',
    label: 'Eco',
    icon: 'globe',
    hint: 'True black, dimmed images and no animation — saves battery on OLED screens.',
  },
]

const VALUES = ADMIN_THEMES.map((t) => t.value)
export const isAdminTheme = (v) => VALUES.includes(v)

export function readAdminTheme() {
  if (typeof window === 'undefined') return 'light'
  try {
    const v = localStorage.getItem(KEY)
    return isAdminTheme(v) ? v : 'light'
  } catch {
    return 'light'
  }
}

export function useAdminTheme() {
  // Always start on the server-rendered default and adopt the stored choice
  // after mount, so the markup React hydrates against always matches.
  const [theme, setThemeState] = useState('light')

  useEffect(() => {
    setThemeState(readAdminTheme())
  }, [])

  useEffect(() => {
    const el = document.documentElement
    el.setAttribute('data-admin-theme', theme)
    // Leaving the admin must not tint the storefront.
    return () => el.removeAttribute('data-admin-theme')
  }, [theme])

  const setTheme = useCallback((next) => {
    if (!isAdminTheme(next)) return
    setThemeState(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* private mode — the theme just won't persist */
    }
  }, [])

  return { theme, setTheme }
}
