import { createContext, useContext, useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'

// Holds the active Lenis smooth-scroll instance (or null when unavailable —
// reduced-motion users, or before init). The site scrolls inside a custom
// container (see Layout), so Lenis is bound to that wrapper/content pair rather
// than the window. Consumers use `useLenis()` to drive programmatic scrolling
// (back-to-top, in-page anchors) through Lenis instead of native scrollTo, so
// the two never fight.
const LenisContext = createContext(null)

export const useLenis = () => useContext(LenisContext)

// Attaches Lenis to the given wrapper/content refs and runs its RAF loop.
// Returns the instance via context. No-ops (native scroll) for reduced motion.
export function LenisProvider({ wrapperRef, contentRef, children }) {
  const [lenis, setLenis] = useState(null)
  const lenisRef = useRef(null)

  useEffect(() => {
    const wrapper = wrapperRef?.current
    const content = contentRef?.current
    if (!wrapper || !content) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return // leave native scrolling untouched

    const instance = new Lenis({
      wrapper,
      content,
      duration: 1.05,
      // easeOutExpo — quick to react, long graceful settle.
      easing: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    })
    lenisRef.current = instance
    setLenis(instance)

    let raf
    const loop = (time) => {
      instance.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      instance.destroy()
      lenisRef.current = null
      setLenis(null)
    }
  }, [wrapperRef, contentRef])

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
}
