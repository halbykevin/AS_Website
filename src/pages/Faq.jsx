import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { useContent } from '../store/content.jsx'
import { siteFaq } from '../lib/faq.js'
import { hoursLines } from '../lib/hours.js'

// /faq — what people ask about AS Company: what it does, where the shop is and
// when it is open, the solutions, the online store, events and how to reach us.
// The questions and answers come from lib/faq.js, which builds them from the
// site's own content; the FAQPage markup in lib/seo.js is built from the same
// list, so the page and the markup always say the same thing.
//
// Deliberately static — no scroll-reveal: every answer is on the page from the
// first paint, for readers and for crawlers alike.
export default function Faq() {
  const content = useContent()
  const { shop } = content
  const items = siteFaq(content)
  const hours = hoursLines(shop?.hours)

  return (
    <article>
      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden border-b border-black/5 bg-as-charcoal/[0.02]">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-as-red/5 blur-3xl" />
        <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-as-red">FAQ</p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-as-charcoal sm:text-4xl lg:text-5xl">
            Frequently asked questions
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-as-charcoal/65 sm:text-lg">
            Where to find us, when we&apos;re open, and how to shop, book an event or get in touch.
          </p>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
          {/* ---------------- Questions ---------------- */}
          <div className="divide-y divide-black/[0.07] border-y border-black/[0.07]">
            {items.map((it) => (
              <div key={it.id} id={it.id} className="scroll-mt-24 py-7">
                <h2 className="text-lg font-bold text-as-charcoal sm:text-xl">{it.q}</h2>
                <div className="mt-2 space-y-2 text-base leading-relaxed text-as-charcoal/65">
                  {it.a.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                {it.links?.length > 0 && (
                  <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
                    {it.links.map((l) =>
                      l.href.startsWith('/') ? (
                        <Link key={l.href} to={l.href} className="text-as-red transition hover:text-as-red-light">
                          {l.label} →
                        </Link>
                      ) : (
                        <a
                          key={l.href}
                          href={l.href}
                          {...(l.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                          className="text-as-red transition hover:text-as-red-light"
                        >
                          {l.label} →
                        </a>
                      ),
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* ---------------- Visit us ---------------- */}
          {(shop?.address || hours.length > 0) && (
            <aside className="h-fit rounded-2xl border border-black/[0.06] bg-as-charcoal/[0.03] p-5 sm:p-6 lg:sticky lg:top-6">
              <p className="text-sm font-bold text-as-charcoal">Visit us</p>
              {shop?.address && (
                <p className="mt-3 flex gap-2.5 text-sm leading-relaxed text-as-charcoal/70">
                  <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-as-red" />
                  <span>
                    {shop.name || 'AS Store'}
                    <br />
                    {shop.address}
                  </span>
                </p>
              )}
              {hours.length > 0 && (
                <div className="mt-4 flex gap-2.5 text-sm text-as-charcoal/70">
                  <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-as-red" />
                  <dl className="space-y-1">
                    {hours.map((h) => (
                      <div key={h.label}>
                        <dt className="font-semibold text-as-charcoal">{h.label}</dt>
                        <dd className={h.value === 'Closed' ? 'text-as-charcoal/45' : ''}>{h.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              <Link
                to="/contact"
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-as-red px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-as-red-light"
              >
                Contact us <span aria-hidden>→</span>
              </Link>
            </aside>
          )}
        </div>
      </section>
    </article>
  )
}
