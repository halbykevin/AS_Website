'use client'

import { motion } from 'framer-motion'

const EASE = [0.22, 0.61, 0.36, 1]

// Full-screen holding page shown while settings.published is off. Matches the
// homepage's dark cinema styling. /admin is never gated, and ?preview=1 lets
// staff browse the real site while it's hidden.
export default function ComingSoon({ settings }) {
  const contact = settings?.contact || {}
  return (
    <main className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-[#0B0D0E] px-6 text-center">
      {/* Breathing red glows */}
      <motion.div
        className="pointer-events-none absolute -left-40 top-[-10%] h-[60vh] w-[60vh] rounded-full bg-as-red/25 blur-[140px]"
        animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute -right-40 bottom-[-20%] h-[70vh] w-[70vh] rounded-full bg-as-red-dark/30 blur-[160px]"
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.6, 0.35, 0.6] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />
      <p
        aria-hidden
        className="text-stroke-white pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap text-[24vw] font-black leading-none sm:text-[18vw]"
      >
        SOON
      </p>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE }}
        className="relative"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/as-store-logo.png" alt="AS Store" className="mx-auto h-12 w-auto" />
        <h1 className="mt-8 text-4xl font-bold tracking-apple text-white sm:text-6xl">
          Something big is coming.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-white/60">
          The AS Store is getting ready — genuine tech, delivered anywhere in Lebanon.
        </p>
        {(contact.phone || contact.email) && (
          <p className="mt-8 text-sm text-white/40">
            Until then, reach us{contact.phone && <> at <span className="text-white/70">{contact.phone}</span></>}
            {contact.phone && contact.email && ' or '}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="text-as-red-light hover:underline">
                {contact.email}
              </a>
            )}
            .
          </p>
        )}
      </motion.div>
    </main>
  )
}
