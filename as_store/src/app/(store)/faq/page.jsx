import Link from 'next/link'
import { loadSettings, loadWalletRules } from '@/lib/site'
import { faqJsonLd, storeFaq } from '@/lib/faq'
import { hoursLines } from '@/lib/hours'
import { SITE_URL, breadcrumbJsonLd, jsonLdScript } from '@/lib/seo'

// /faq — the questions a shopper (and an answer engine) asks before buying:
// where the shop is and when it is open, delivery, prices and VAT, payment,
// returns, and how to reach us. Every answer comes from lib/faq.js, which
// derives it from the same settings the checkout charges by; this page only
// lays it out. The FAQPage markup is built from the same list, so the two
// cannot drift.

export const metadata = {
  title: 'FAQ — Delivery, Returns & Opening Hours',
  description:
    'AS Store questions answered: where the shop is and when it is open, delivery across Lebanon, prices and VAT, payment, returns and how to reach us.',
  alternates: { canonical: '/faq' },
}

export default async function FaqPage() {
  const [settings, wallet] = await Promise.all([loadSettings(), loadWalletRules()])
  const groups = storeFaq(settings, wallet)
  const address = String(settings.contact?.address || '').trim()
  const hours = hoursLines(settings.hours)
  const crumbs = breadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: 'FAQ', url: '/faq' },
  ])

  return (
    <article className="bg-white pb-24 pt-28 sm:pt-32">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqJsonLd(groups, `${SITE_URL}/faq`))} />
      {crumbs && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />}

      <div className="mx-auto w-full max-w-[760px] px-6">
        <h1 className="text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">
          Frequently asked questions
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-as-ink/70">
          Where to find us, when we are open, and how delivery, payment and returns work.
        </p>

        {(address || hours.length > 0) && (
          <section
            aria-labelledby="visit"
            className="mt-10 rounded-[28px] border border-as-ink/10 bg-as-fog/60 p-6 sm:p-8"
          >
            <h2 id="visit" className="text-xl font-semibold text-as-ink">
              Visit the shop
            </h2>
            {address && <p className="mt-2 text-lg text-as-ink/80">{address}</p>}
            {hours.length > 0 && (
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-base">
                {hours.map((h) => (
                  <div key={h.label} className="contents">
                    <dt className="font-medium text-as-ink">{h.label}</dt>
                    <dd className={h.value === 'Closed' ? 'text-as-ink/45' : 'text-as-ink/75'}>{h.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}

        {groups.map((g) => (
          <section key={g.title} className="mt-12">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-as-red">{g.title}</h2>
            <div className="mt-3 divide-y divide-as-ink/10 border-y border-as-ink/10">
              {g.items.map((it) => (
                <div key={it.id} id={it.id} className="scroll-mt-28 py-6">
                  <h3 className="text-xl font-semibold text-as-ink">{it.q}</h3>
                  <div className="mt-2 space-y-2 text-lg leading-relaxed text-as-ink/70">
                    {it.a.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                  {it.links?.length > 0 && (
                    <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-base">
                      {it.links.map((l) =>
                        l.href.startsWith('/') ? (
                          <Link key={l.href} href={l.href} className="font-medium text-as-red hover:underline">
                            {l.label} →
                          </Link>
                        ) : (
                          <a key={l.href} href={l.href} className="font-medium text-as-red hover:underline">
                            {l.label} →
                          </a>
                        ),
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}
