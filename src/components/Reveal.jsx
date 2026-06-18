import { motion, useReducedMotion } from 'framer-motion'

// Fades + slides its children in the first time they scroll into view, on any
// scroll (Framer Motion's whileInView uses IntersectionObserver, so it fires on
// mobile and inside the custom scroll container too). Respects reduced motion.
//
// API kept stable: `children`, `className`, `delay` (ms), `as` (tag name).
export default function Reveal({ children, className = '', delay = 0, as = 'div', y = 24 }) {
  const reduce = useReducedMotion()

  if (reduce) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  const MotionTag = motion[as] || motion.div
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.6, ease: [0.22, 0.7, 0.3, 1], delay: delay / 1000 }}
    >
      {children}
    </MotionTag>
  )
}
