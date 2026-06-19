import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import Reveal from '../components/Reveal.jsx'
import { useContent } from '../store/content.jsx'

// "What We Do" (Absolute Solution) overview page: about copy, the solution
// tiles (each opens its own detail page), vision & mission, and the divisions.
export default function WhatWeDo() {
  const { whatWeDo, solutions, contact } = useContent()
  const list = (solutions || []).filter((s) => s.visible !== false)

  return (
    <>
      {/* ---------------- Hero / About ---------------- */}
      <section className="relative overflow-hidden border-b border-black/5">
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-as-red/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-as-charcoal/5 blur-3xl" />

        <div className="mx-auto max-w-4xl px-5 py-20 text-center sm:px-8 sm:py-28">
          <p className="inline-flex items-center rounded-full border border-as-red/20 bg-as-red/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-as-red animate-fade-up">
            {whatWeDo.eyebrow}
          </p>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-as-charcoal sm:text-5xl lg:text-6xl animate-fade-up">
            {whatWeDo.title}
          </h1>
          <div className="mx-auto mt-6 max-w-2xl space-y-4">
            {whatWeDo.intro.map((p, i) => (
              <Reveal key={i} delay={i * 80}>
                <p className="text-base leading-relaxed text-as-charcoal/60 sm:text-lg">{p}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Our Solutions ---------------- */}
      <section className="bg-as-charcoal/[0.02] py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-as-charcoal sm:text-4xl">
              {whatWeDo.solutionsHeading}
            </h2>
            {whatWeDo.solutionsIntro && (
              <p className="mt-4 text-base leading-relaxed text-as-charcoal/60">{whatWeDo.solutionsIntro}</p>
            )}
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((s, i) => (
              <Reveal key={s.slug} delay={i * 70}>
                <Link
                  to={`/what-we-do/${s.slug}`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-as-red/20 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-as-red/10 text-as-red transition group-hover:bg-as-red group-hover:text-white">
                    <Icon name={s.icon} className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-as-charcoal transition group-hover:text-as-red">
                    {s.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-as-charcoal/60">{s.summary}</p>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-as-red transition group-hover:gap-2">
                    Explore
                    <Icon name="arrow" className="h-4 w-4" />
                  </span>
                  <span className="absolute bottom-0 left-0 h-1 w-full origin-left scale-x-0 bg-as-red transition-transform duration-300 ease-out group-hover:scale-x-100" />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Vision & Mission ---------------- */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 sm:px-8 lg:grid-cols-2">
          <Reveal className="relative overflow-hidden rounded-3xl bg-as-charcoal p-8 text-white shadow-sm sm:p-10">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-as-red/20 blur-3xl" />
            <span className="inline-flex items-center rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-white/80">
              {whatWeDo.visionHeading}
            </span>
            <p className="relative mt-5 text-lg leading-relaxed text-white/85">{whatWeDo.vision}</p>
          </Reveal>
          <Reveal delay={120} className="relative overflow-hidden rounded-3xl border border-black/5 bg-white p-8 shadow-sm sm:p-10">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-as-red/5 blur-3xl" />
            <span className="inline-flex items-center rounded-full border border-as-red/20 bg-as-red/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-as-red">
              {whatWeDo.missionHeading}
            </span>
            <p className="relative mt-5 text-lg leading-relaxed text-as-charcoal/70">{whatWeDo.mission}</p>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Divisions ---------------- */}
      {whatWeDo.divisions?.length > 0 && (
        <section className="bg-as-charcoal/[0.02] py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-extrabold tracking-tight text-as-charcoal sm:text-4xl">
                {whatWeDo.divisionsHeading}
              </h2>
              {whatWeDo.divisionsIntro && (
                <p className="mt-4 text-base text-as-charcoal/60">{whatWeDo.divisionsIntro}</p>
              )}
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {whatWeDo.divisions.map((d, i) => (
                <Reveal
                  key={i}
                  delay={i * 80}
                  className="group rounded-2xl border border-black/5 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-as-red/20 hover:shadow-md"
                >
                  <h3 className="text-xl font-bold text-as-red">{d.name}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-as-charcoal/65">{d.description}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------------- CTA ---------------- */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
          <h2 className="text-2xl font-extrabold tracking-tight text-as-charcoal sm:text-3xl">
            Let&rsquo;s build your next solution.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-as-charcoal/60">
            Talk to our team about how Absolute Solution can support your business.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={contact.whatsapp}
              target="_blank"
              rel="noreferrer"
              className="w-full rounded-full bg-as-red px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light hover:shadow-md sm:w-auto"
            >
              Get in touch
            </a>
            <Link
              to="/"
              className="w-full rounded-full border border-black/10 bg-white px-8 py-3.5 text-sm font-semibold text-as-charcoal transition hover:border-as-red/30 hover:text-as-red sm:w-auto"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
