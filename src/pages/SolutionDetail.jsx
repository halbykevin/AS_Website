import { Link, useParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import Reveal from '../components/Reveal.jsx'
import { useContent } from '../store/content.jsx'

// Detail page for a single Absolute Solution "solution": its intro, the list of
// services it covers, an optional closing note, and prev/next navigation.
export default function SolutionDetail() {
  const { slug } = useParams()
  const { solutions, getSolution, contact } = useContent()
  const solution = getSolution(slug)

  if (!solution) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8">
        <h1 className="text-3xl font-extrabold text-as-charcoal">Solution not found</h1>
        <p className="mt-4 text-as-charcoal/60">This solution may have been moved or renamed.</p>
        <Link
          to="/what-we-do"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-as-red px-6 py-3 text-sm font-semibold text-white transition hover:bg-as-red-light"
        >
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          Back to What We Do
        </Link>
      </section>
    )
  }

  const list = (solutions || []).filter((s) => s.visible !== false)
  const idx = list.findIndex((s) => s.slug === solution.slug)
  const prev = idx > 0 ? list[idx - 1] : null
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null
  const hasDescriptions = solution.items.some((it) => it.description)

  return (
    <article>
      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden border-b border-black/5 bg-as-charcoal/[0.02]">
        <div className="pointer-events-none absolute -top-28 -right-24 h-80 w-80 rounded-full bg-as-red/5 blur-3xl" />
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <Link
            to="/what-we-do"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-as-charcoal/55 transition hover:text-as-red"
          >
            <Icon name="arrow" className="h-4 w-4 rotate-180" />
            What We Do
          </Link>

          <div className="mt-6 flex items-start gap-5">
            <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-as-red/10 text-as-red sm:flex">
              <Icon name={solution.icon} className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-as-charcoal sm:text-4xl lg:text-5xl">
                {solution.title}
              </h1>
              {solution.intro && (
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-as-charcoal/65 sm:text-lg">
                  {solution.intro}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Optional image ---------------- */}
      {solution.image && (
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="-mt-8 overflow-hidden rounded-3xl shadow-md ring-1 ring-black/5">
            <img src={solution.image} alt={solution.title} className="h-56 w-full object-cover sm:h-80" loading="lazy" />
          </div>
        </div>
      )}

      {/* ---------------- Items ---------------- */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          {hasDescriptions ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {solution.items.map((it, i) => (
                <Reveal
                  key={i}
                  delay={i * 60}
                  className="group rounded-2xl border border-black/5 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-as-red/20 hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-as-red/10 text-sm font-bold text-as-red transition group-hover:bg-as-red group-hover:text-white">
                      {i + 1}
                    </span>
                    <h3 className="text-base font-bold text-as-charcoal transition group-hover:text-as-red">
                      {it.title}
                    </h3>
                  </div>
                  {it.description && (
                    <p className="mt-3 text-sm leading-relaxed text-as-charcoal/60">{it.description}</p>
                  )}
                </Reveal>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {solution.items.map((it, i) => (
                <Reveal
                  key={i}
                  delay={i * 50}
                  className="group flex items-center gap-3 rounded-xl border border-black/5 bg-white px-5 py-4 shadow-sm transition hover:border-as-red/20 hover:shadow-md"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-as-red/10 text-as-red transition group-hover:bg-as-red group-hover:text-white">
                    <Icon name="arrow" className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold text-as-charcoal">{it.title}</span>
                </Reveal>
              ))}
            </div>
          )}

          {solution.outro && (
            <Reveal className="mt-10 rounded-2xl border border-as-red/15 bg-as-red/[0.04] px-6 py-5">
              <p className="text-base leading-relaxed text-as-charcoal/70">{solution.outro}</p>
            </Reveal>
          )}

          {/* CTA */}
          <div className="mt-12 flex flex-col items-center justify-center gap-3 rounded-3xl bg-as-charcoal/[0.03] px-6 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <h2 className="text-xl font-bold text-as-charcoal">Interested in {solution.title}?</h2>
              <p className="mt-1 text-sm text-as-charcoal/60">Reach out and our team will guide you through the options.</p>
            </div>
            <a
              href={contact.whatsapp}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-full bg-as-red px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light hover:shadow-md"
            >
              Get in touch
            </a>
          </div>

          {/* Prev / next */}
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {prev ? (
              <Link
                to={`/what-we-do/${prev.slug}`}
                className="group flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-5 text-left shadow-sm transition hover:border-as-red/20 hover:shadow-md"
              >
                <Icon name="arrow" className="h-5 w-5 rotate-180 text-as-red" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-as-charcoal/45">Previous</span>
                  <span className="block truncate font-semibold text-as-charcoal group-hover:text-as-red">{prev.title}</span>
                </span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {next && (
              <Link
                to={`/what-we-do/${next.slug}`}
                className="group flex items-center justify-end gap-3 rounded-2xl border border-black/5 bg-white p-5 text-right shadow-sm transition hover:border-as-red/20 hover:shadow-md"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-as-charcoal/45">Next</span>
                  <span className="block truncate font-semibold text-as-charcoal group-hover:text-as-red">{next.title}</span>
                </span>
                <Icon name="arrow" className="h-5 w-5 text-as-red" />
              </Link>
            )}
          </div>
        </div>
      </section>
    </article>
  )
}
