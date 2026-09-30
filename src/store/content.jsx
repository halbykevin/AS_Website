import { createContext, useContext, useEffect, useState } from 'react'
import { loadSite, defaultContent } from '../lib/api.js'
import { events as defaultEvents } from '../data/events.js'

const ContentContext = createContext(null)

// A pre-rendered page ships with the content it was built from
// (window.__AS_DATA__, see scripts/prerender.mjs and main.jsx), so the first
// render is the real page rather than a skeleton — and it must be, because
// hydration has to reproduce the HTML the visitor already has. The live API is
// still asked straight afterwards: the snapshot is only as fresh as the last
// build, and events are left out of it on purpose (see snapshotOf()).
export function ContentProvider({ initialData = null, children }) {
  const [state, setState] = useState(() =>
    initialData
      ? { loading: false, content: initialData.content, events: initialData.events || [] }
      : { loading: true, content: defaultContent, events: defaultEvents },
  )

  // Swap the browser-tab icon + iOS home-screen icon if the admin set one.
  // (Title, description and the rest of the head are RouteHead's job.)
  useEffect(() => {
    if (state.loading) return
    const faviconUrl = state.content?.faviconUrl
    if (faviconUrl) {
      const setIcon = (rel) => {
        let link = document.querySelector(`link[rel='${rel}']`)
        if (!link) {
          link = document.createElement('link')
          link.rel = rel
          document.head.appendChild(link)
        }
        if (link.getAttribute('href') !== faviconUrl) link.href = faviconUrl
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
        setState((prev) => ({
          loading: false,
          content: { ...data.content, storeBanner: keepFirstSlide(prev.content.storeBanner, data.content.storeBanner) },
          events: data.events,
        }))
      } else if (!initialData) {
        // Backend unreachable — use static defaults.
        setState({ loading: false, content: defaultContent, events: defaultEvents })
      }
      // With a snapshot, a failed refresh keeps it: it is real content, only as
      // old as the last build.
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

// The store slideshow in "random" mode is a fresh sample on every API call, so
// the refresh that follows a pre-rendered page would swap the products under
// the visitor's eyes a moment after it loaded. Keep the slide already on screen
// and take the rest from the fresh sample: the page stays still, and every
// later slide is still new per visit. The admin's own picks ("specific") are
// deterministic, so those are taken as they come.
function keepFirstSlide(prev, next) {
  if (!prev?.products?.length || !next?.products?.length || next.mode !== 'random') return next
  const first = prev.products.slice(0, next.perSlide)
  const shown = new Set(first.map((p) => p.id))
  return { ...next, products: [...first, ...next.products.filter((p) => !shown.has(p.id))] }
}

export function useContent() {
  const ctx = useContext(ContentContext)
  if (!ctx) throw new Error('useContent must be used within <ContentProvider>')
  return ctx
}
