import Reveal from './Reveal.jsx'
import { bento } from '@/lib/products'

// Apple "lineup" bento: heading + image tiles, light or dark. Entrance via
// Reveal; image gently zooms on hover.
export default function BentoGrid() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="shell-wide">
        <Reveal>
          <h2 className="mb-10 text-center text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">
            Explore the lineup.
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {bento.map((t, i) => {
            const dark = t.tone === 'dark'
            return (
              <Reveal key={t.title} delay={(i % 3) * 0.08} className={t.span || ''}>
                <a
                  href="#"
                  className={`group flex h-[440px] flex-col overflow-hidden rounded-[28px] text-center ${
                    dark ? 'bg-black text-white' : 'bg-as-fog text-as-ink'
                  }`}
                >
                  <div className="px-8 pt-10">
                    <h3 className="text-2xl font-semibold tracking-apple sm:text-3xl">{t.title}</h3>
                    <p className={`mt-1 text-base ${dark ? 'text-white/65' : 'text-as-ink/55'}`}>
                      {t.copy}
                    </p>
                    <div className="mt-3 flex items-center justify-center gap-5 text-[15px] font-medium">
                      <span className="text-as-red-light group-hover:underline">Learn more ›</span>
                      <span className={dark ? 'text-white group-hover:underline' : 'text-as-red group-hover:underline'}>
                        Shop ›
                      </span>
                    </div>
                  </div>
                  <div className="mt-6 w-full flex-1 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.image}
                      alt={t.title}
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  </div>
                </a>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
