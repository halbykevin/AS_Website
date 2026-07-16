// Tilted red ribbon of store promises, drifting on a pure CSS marquee.
// (Previously a framer-motion useAnimationFrame loop that wrote styles from JS
// every frame forever and skewed with scroll velocity — a main-thread hog on
// phones. The CSS animation runs on the compositor and ships zero JS: this is
// now a server component.)
export default function VelocityBand({ phrases }) {
  const items = (Array.isArray(phrases) && phrases.length
    ? phrases
    : ['Free delivery on orders over $100', '12 months warranty', 'Cash on delivery', '100% genuine tech']
  ).map((s) => s.toUpperCase())

  const row = (key) =>
    items.map((t, i) => (
      <span key={`${key}-${i}`} className="flex items-center gap-6 pr-6 sm:gap-10 sm:pr-10">
        {t}
        <span aria-hidden className="text-white/50">
          ✦
        </span>
      </span>
    ))

  return (
    // overflow-hidden is load-bearing: the w-max track is thousands of px wide
    // and would otherwise blow up the mobile layout viewport (breaking the
    // fixed nav). The band bleeds past the clip with -mx so the tilt shows no
    // clipped corners; bg matches the dark acts around it.
    <section aria-label="Store promises" className="relative overflow-hidden bg-[#0B0D0E] py-8">
      <div className="-mx-4 rotate-[-2deg] bg-as-red py-4 shadow-[0_20px_60px_-20px_rgba(164,30,34,0.8)] sm:py-5">
        {/* animate-marquee translates 0 → -50%, so the row is duplicated once
            for a seamless loop. */}
        <div className="flex w-max animate-marquee whitespace-nowrap text-2xl font-black uppercase tracking-tight text-white [animation-duration:22s] sm:text-4xl">
          {row('a')}
          {row('b')}
        </div>
      </div>
    </section>
  )
}
