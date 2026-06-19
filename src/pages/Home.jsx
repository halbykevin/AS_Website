import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import EventCard from '../components/EventCard.jsx'
import BannerSlider from '../components/BannerSlider.jsx'
import CategoryTiles from '../components/CategoryTiles.jsx'
import HorizontalStory from '../components/HorizontalStory.jsx'
import Reveal from '../components/Reveal.jsx'
import { useContent } from '../store/content.jsx'

export default function Home() {
  const { hero, services, solutions, eventsSection, store, story, about, ticketing, events, banners, sections, categories } = useContent()
  const solutionCards = (solutions || []).filter((s) => s.visible !== false)
  const upcoming = events.slice(0, 3)

  return (
    <>
      {/* ---------------- Horizontal scroll-story (top of page, admin-managed) ---------------- */}
      <HorizontalStory story={story} />

      {/* ---------------- Banner slideshow (admin-managed) ---------------- */}
      <BannerSlider banners={banners} />

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-as-red/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-as-charcoal/5 blur-3xl" />

        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:py-32">
          <div className="mx-auto max-w-3xl text-center animate-fade-up">
            <p className="inline-flex items-center rounded-full border border-as-red/20 bg-as-red/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-as-red">
              {hero.eyebrow}
            </p>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-as-charcoal sm:text-5xl lg:text-6xl">
              {hero.title}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-as-charcoal/60 sm:text-lg">
              {hero.subtitle}
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to={hero.primaryCta.href}
                className="w-full rounded-full bg-as-red px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light hover:shadow-md sm:w-auto"
              >
                {hero.primaryCta.label}
              </Link>
              <a
                href={hero.secondaryCta.href}
                className="w-full rounded-full border border-black/10 bg-white px-8 py-3.5 text-sm font-semibold text-as-charcoal transition hover:border-as-red/30 hover:text-as-red sm:w-auto"
              >
                {hero.secondaryCta.label}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- What We Do (solutions) ---------------- */}
      <section id="services" className="scroll-mt-24 bg-as-charcoal/[0.02] py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-as-charcoal sm:text-4xl">
              {services.heading}
            </h2>
            <p className="mt-4 text-base text-as-charcoal/60">{services.subheading}</p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {solutionCards.map((item, i) => (
              <Reveal key={item.slug} delay={i * 70}>
                <Link
                  to={`/what-we-do/${item.slug}`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-as-red/20 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-as-red/10 text-as-red transition group-hover:bg-as-red group-hover:text-white">
                    <Icon name={item.icon} className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-as-charcoal transition group-hover:text-as-red">{item.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-as-charcoal/60">{item.summary}</p>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-as-red transition group-hover:gap-2">
                    Learn more
                    <Icon name="arrow" className="h-4 w-4" />
                  </span>
                  {/* Red line that sweeps across on hover */}
                  <span className="absolute bottom-0 left-0 h-1 w-full origin-left scale-x-0 bg-as-red transition-transform duration-300 ease-out group-hover:scale-x-100" />
                </Link>
              </Reveal>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              to="/what-we-do"
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-7 py-3 text-sm font-semibold text-as-charcoal transition hover:border-as-red/30 hover:text-as-red"
            >
              Explore Absolute Solution
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------- Browse by category + Upcoming events ---------------- */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          {/* Browse by category (comes first) */}
          {categories.length > 0 && (
            <div className="mb-14">
              <h2 className="text-3xl font-extrabold tracking-tight text-as-charcoal sm:text-4xl">
                Browse by category
              </h2>
              <Reveal className="mt-8">
                <CategoryTiles categories={categories} />
              </Reveal>
            </div>
          )}

          {/* Upcoming events */}
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-as-charcoal sm:text-4xl">
                {eventsSection.heading}
              </h2>
              <p className="mt-3 flex items-center gap-2 text-sm text-as-charcoal/55">
                <img src={ticketing.logo} alt={ticketing.name} className="h-6 w-auto" />
                {ticketing.note}
              </p>
            </div>
            <Link
              to="/events"
              className="flex items-center gap-1 text-sm font-semibold text-as-red transition hover:gap-2"
            >
              View all events
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((event, i) => (
              <Reveal key={event.id} delay={i * 80}>
                <EventCard event={event} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- AS Store callout ---------------- */}
      <StoreCallout store={store} />

      {/* ---------------- About ---------------- */}
      <section id="about" className="scroll-mt-24 py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-3xl font-extrabold tracking-tight text-as-charcoal sm:text-4xl">
              {about.heading}
            </h2>
            {about.body.map((p, i) => (
              <p key={i} className="mt-4 text-base leading-relaxed text-as-charcoal/60">
                {p}
              </p>
            ))}
          </Reveal>
          <Reveal delay={120} className="grid grid-cols-3 gap-3 sm:gap-4">
            {about.stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-black/5 bg-white p-3 text-center shadow-sm sm:p-5"
              >
                <p className="text-lg font-extrabold leading-tight text-as-red [overflow-wrap:anywhere] sm:text-2xl lg:text-3xl">
                  {s.value}
                </p>
                <p className="mt-1 text-xs font-medium text-as-charcoal/55">{s.label}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ---------------- Custom sections (admin-created) ---------------- */}
      {sections.map((section) => (
        <CustomSection key={section.id} section={section} />
      ))}
    </>
  )
}

// Renders a section created from the admin dashboard: optional eyebrow,
// heading, paragraphs, image and button, on a light or dark background.
function CustomSection({ section }) {
  const dark = section.theme === 'dark'
  const paragraphs = section.body.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean)
  const isExternal = /^https?:\/\//i.test(section.buttonUrl)

  const button = section.buttonLabel && section.buttonUrl && (
    <a
      href={section.buttonUrl}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noreferrer' : undefined}
      className="mt-7 inline-flex items-center rounded-full bg-as-red px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light hover:shadow-md"
    >
      {section.buttonLabel}
    </a>
  )

  return (
    <section className={`py-20 sm:py-24 ${dark ? 'bg-as-charcoal' : 'bg-as-charcoal/[0.02]'}`}>
      <div
        className={`mx-auto max-w-7xl items-center gap-12 px-5 sm:px-8 ${
          section.image ? 'grid lg:grid-cols-2' : 'flex flex-col text-center'
        }`}
      >
        <div className={section.image ? '' : 'mx-auto max-w-2xl'}>
          {section.eyebrow && (
            <span
              className={`inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest ${
                dark ? 'bg-white/10 text-white/80' : 'border border-as-red/20 bg-as-red/5 text-as-red'
              }`}
            >
              {section.eyebrow}
            </span>
          )}
          <h2
            className={`mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl ${
              dark ? 'text-white' : 'text-as-charcoal'
            }`}
          >
            {section.heading}
          </h2>
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className={`mt-4 text-base leading-relaxed ${dark ? 'text-white/70' : 'text-as-charcoal/60'}`}
            >
              {p}
            </p>
          ))}
          {button}
        </div>
        {section.image && (
          <div className="overflow-hidden rounded-3xl shadow-md">
            <img src={section.image} alt={section.heading} className="h-full w-full object-cover" loading="lazy" />
          </div>
        )}
      </div>
    </section>
  )
}

function StoreCallout({ store }) {
  const isLive = Boolean(store.url)
  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-black/5 bg-gradient-to-br from-white to-as-charcoal/[0.04] px-6 py-12 shadow-sm sm:px-12 sm:py-16">
          {/* soft brand glows */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-as-red/5 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-as-charcoal/5 blur-3xl" />

          <div className="relative flex flex-col items-center gap-10 text-center lg:flex-row lg:justify-between lg:gap-12 lg:text-left">
            <div className="max-w-xl">
              {store.eyebrow && (
                <span className="inline-flex items-center rounded-full border border-as-red/20 bg-as-red/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-as-red">
                  {store.eyebrow}
                </span>
              )}
              <img
                src="/asStorelogoClear.png"
                alt={store.title}
                className="mx-auto mt-6 h-16 w-auto sm:h-20 lg:mx-0"
              />
              <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-as-charcoal/60 lg:mx-0">
                {store.description}
              </p>
            </div>

            <a
              href={isLive ? store.url : undefined}
              target={isLive ? '_blank' : undefined}
              rel={isLive ? 'noreferrer' : undefined}
              aria-disabled={!isLive}
              onClick={(e) => !isLive && e.preventDefault()}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-8 py-4 text-sm font-semibold shadow-sm transition ${
                isLive
                  ? 'bg-as-red text-white hover:bg-as-red-light hover:shadow-md'
                  : 'cursor-not-allowed border border-black/10 bg-white text-as-charcoal/50'
              }`}
            >
              <Icon name="store" className="h-5 w-5" />
              {isLive ? store.cta : 'Coming soon'}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
