import { notFound } from 'next/navigation'
import ContactBody from '@/components/ContactBody.jsx'
import { loadPage, loadSettings } from '@/lib/site'

// Slugs that render the contact block (form + WhatsApp) instead of CMS text.
const CONTACT_SLUGS = new Set(['support', 'contact'])

// Renders a CMS content page at /pages/<slug>. Body paragraphs are split on
// blank lines. The "support" slug renders the contact form + WhatsApp instead.
export async function generateMetadata({ params }) {
  if (CONTACT_SLUGS.has(params.slug)) return { title: 'Support — AS Store' }
  const page = await loadPage(params.slug)
  return { title: page ? `${page.title} — AS Store` : 'AS Store' }
}

export default async function ContentPage({ params }) {
  // Support = the contact/help page: email form + WhatsApp button.
  if (CONTACT_SLUGS.has(params.slug)) {
    const settings = await loadSettings()
    return (
      <section className="bg-as-bg pb-24 pt-28 sm:pt-32">
        <ContactBody
          settings={settings}
          eyebrow="We're here to help"
          title="Support"
          subtitle="Need a hand with an order, a product, or a warranty question? Send us a message below or chat with us instantly on WhatsApp."
        />
      </section>
    )
  }

  const page = await loadPage(params.slug)
  if (!page || page.visible === false) notFound()

  const paragraphs = (page.body || '').split(/\n{2,}/).filter(Boolean)

  return (
    <article className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="mx-auto w-full max-w-[760px] px-6">
        <h1 className="text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">{page.title}</h1>
        <div className="mt-8 space-y-5 text-lg leading-relaxed text-as-ink/70">
          {paragraphs.length > 0 ? (
            paragraphs.map((para, i) => (
              <p key={i} className="whitespace-pre-line">
                {para}
              </p>
            ))
          ) : (
            <p className="text-as-ink/40">This page has no content yet.</p>
          )}
        </div>
      </div>
    </article>
  )
}
