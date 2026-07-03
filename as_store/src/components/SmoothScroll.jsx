'use client'

import { ReactLenis } from 'lenis/react'
import { useReducedMotion } from 'framer-motion'

// Lenis smooth scrolling for the storefront (lenis.dev). Runs on the window
// (`root`) so framer-motion's useScroll values inherit the smoothing — every
// scroll-linked animation eases instead of stepping. The admin lives in its
// own layout and is untouched. Honors prefers-reduced-motion.
export default function SmoothScroll({ children }) {
  const reduced = useReducedMotion()
  return (
    <ReactLenis
      root
      options={{
        duration: 1.15,
        smoothWheel: !reduced,
        anchors: true,
      }}
    >
      {children}
    </ReactLenis>
  )
}
