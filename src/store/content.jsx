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
  }

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
}

export function useContent() {
  const ctx = useContext(ContentContext)
  if (!ctx) throw new Error('useContent must be used within <ContentProvider>')
  return ctx
}
