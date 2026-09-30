import Link from 'next/link'
import { getCategories, getSettings, getShop } from '@/lib/api'
import { faqJsonLd, hubFaq } from '@/lib/faq'
import { SITE_URL, breadcrumbJsonLd, jsonLdScript } from '@/lib/seo'

// /faq — how reserving works, what is listed and who runs the hub. The
// questions and answers come from lib/faq.js; the FAQPage markup is built from
// the same list, so the page and the markup always match.

export const revalidate = 300

export const metadata = {
  title: 'FAQ — How to Reserve Event Tickets in Lebanon',
  description:
    'How reserving works on AS Ticketing Hub: tap Reserve to book over WhatsApp, pick seats on the live seat map, and when a reservation is confirmed.',
  alternates: { canonical: '/faq' },
}

export default async function FaqPage() {
  const [settings, categories, shop] = await Promise.all([getSettings(), getCategories(), getShop()])
  const items = hubFaq({ settings, categories, shop })
  const crumbs = breadcrumbJsonLd([
    { name: 'Events', url: '/events' },
    { name: 'FAQ', url: '/faq' },
  ])

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqJsonLd(items, `${SITE_URL}/faq`))} />
      {crumbs && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />}

      <section className="bg-as-ink">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Frequently asked questions
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/60">
            How reserving works, what’s listed, and how to reach us.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
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
                      <Link key={l.href} href={l.href} className="text-as-red hover:underline">
                        {l.label} →
                      </Link>
                    ) : (
                      <a key={l.href} href={l.href} className="text-as-red hover:underline">
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
    </>
  )
}
