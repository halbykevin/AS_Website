import { createContext, useContext, useEffect, useState } from 'react'
import { loadSite, defaultContent } from '../lib/api.js'
import { events as defaultEvents } from '../data/events.js'

const ContentContext = createContext(null)

export function ContentProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    content: defaultContent,
    events: defaultEvents,
  })

  // Keep the browser tab title + meta description in sync with the publish gate.
  useEffect(() => {
    if (state.loading) return
    const brand = state.content?.brand
    const published = state.content?.published
    document.title =
      published && brand
        ? `${brand.name} — ${brand.legalName}`
        : 'AS Company — Coming Soon'

    const meta = document.querySelector('meta[name="description"]')
    if (meta) {
      meta.setAttribute(
        'content',
        published && brand
          ? `${brand.name} (${brand.legalName}) — ${brand.tagline}`
          : 'AS Company (Absolute Solutions SAL) — market leader in telecommunication and electronics since 2008. New website coming soon.'
      )
    }

    // Swap the browser-tab icon + iOS home-screen icon if the admin set one.
    const faviconUrl = state.content?.faviconUrl
    if (faviconUrl) {
      const setIcon = (rel) => {
        let link = document.querySelector(`link[rel='${rel}']`)
        if (!link) {
          link = document.createElement('link')
          link.rel = rel
          document.head.appendChild(link)
        }
        link.href = faviconUrl
      }
      setIcon('icon')
      setIcon('apple-touch-icon')
    }
  }, [state.loading, state.content])

  useEffect(() => {
    let active = true
    loadSite().then((data) => {
      if (!active) return
      if (data) {
        setState({ loading: false, content: data.content, events: data.events })
      } else {
        // Backend unreachable — use static defaults.
        setState({ loading: false, content: defaultContent, events: defaultEvents })
      }
    })
    return () => {
      active = false
    }
  }, [])

  const value = {
    loading: state.loading,
    ...state.content,
    events: state.events,
    getEvent: (slug) => state.events.find((e) => e.id === slug),
    getSolution: (slug) => (state.content.solutions || []).find((s) => s.slug === slug),
  }

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
}

export function useContent() {
  const ctx = useContext(ContentContext)
  if (!ctx) throw new Error('useContent must be used within <ContentProvider>')
  return ctx
}
