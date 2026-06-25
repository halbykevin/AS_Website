'use client'

import { motion } from 'framer-motion'

// Scroll-reveal wrapper — fades + lifts content into view once. Apple-style
// easing (a soft easeOut), triggered a bit before the element fully enters.
const EASE = [0.22, 0.61, 0.36, 1]

export default function Reveal({ children, y = 28, delay = 0, className = '', once = true }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-80px' }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}
