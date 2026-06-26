import Hero from '@/components/Hero.jsx'
import PinnedShowcase from '@/components/PinnedShowcase.jsx'
import ProductRail from '@/components/ProductRail.jsx'
import BentoGrid from '@/components/BentoGrid.jsx'
import Reveal from '@/components/Reveal.jsx'
import { loadSettings } from '@/lib/site'

// AS Store homepage — Apple design language: airy hero, a pinned scroll-zoom
// flagship, product rails (live from the API), a bento lineup, and a closing CTA.
export default async function HomePage() {
  const settings = await loadSettings()
  return (
    <>
      <Hero />
      <PinnedShowcase bg={settings.showcaseBg} />
      <ProductRail
        id="latest"
        title="The latest."
        sub="Take a look at what's new, right now."
        category="All"
      />
      <BentoGrid />
      <ProductRail title="Accessories." sub="Top off your setup." category="Accessories" />

      {/* Closing CTA */}
      <section className="bg-white py-24 text-center">
        <div className="shell">
          <Reveal>
            <h2 className="text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">
              Shop the entire AS Store.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-lg text-as-ink/60">
              Genuine tech, official warranty, delivered across Lebanon.
            </p>
            <a href="#" className="pill mt-7">
              Browse all products
            </a>
          </Reveal>
        </div>
      </section>
    </>
  )
}
