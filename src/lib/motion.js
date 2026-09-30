import { useSyncExternalStore } from 'react'

// A hydration-safe stand-in for framer-motion's useReducedMotion().
//
// The public pages are pre-rendered at build time (scripts/prerender.mjs) and
// then hydrated. framer-motion's hook reads the media query during the very
// first render — which, on a pre-rendered page, is hydration — while the build
// had no media query to read and always rendered the animated branch. A
// reduced-motion visitor would then hydrate a different tree from the HTML they
// were sent, and React does not patch attributes on a mismatch: every Reveal
// wrapper would keep the server's `opacity: 0` and its content would never
// appear.
//
// useSyncExternalStore answers with the server snapshot while hydrating and
// re-renders with the real preference straight afterwards, which is exactly the
// order that avoids it. On a client-only render (dev, admin) it reads the real
// value from the first render, as before.
const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

const getSnapshot = () => window.matchMedia(QUERY).matches
const getServerSnapshot = () => false

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
