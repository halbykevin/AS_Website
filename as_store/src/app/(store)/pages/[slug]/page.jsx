import { notFound } from 'next/navigation'
import ContactBody from '@/components/ContactBody.jsx'
import AboutContent from '@/components/AboutContent.jsx'
import PrivacyPolicy from '@/components/PrivacyPolicy.jsx'
import ShippingReturns from '@/components/ShippingReturns.jsx'
import TermsConditions from '@/components/TermsConditions.jsx'
import { loadPage, loadSettings } from '@/lib/site'
import { loadBrands } from '@/lib/catalog'

// Slugs that render the contact block (form + WhatsApp) instead of CMS text.
const CONTACT_SLUGS = new Set(['support', 'contact'])

// Renders a CMS content page at /pages/<slug>. Body paragraphs are split on
// blank lines. Some slugs render bespoke pages instead of CMS text: "support"/
// "contact" → the contact form, "about" → the full About page.
export async function generateMetadata({ params }) {
  params = await params
  if (CONTACT_SLUGS.has(params.slug)) return { title: 'Support — AS Store' }
  if (params.slug === 'about') return { title: 'About AS Store' }
  if (params.slug === 'privacy')
    return {
      title: 'Privacy Policy — AS Store',
      description: 'How AS Store collects, uses, and protects your information.',
    }
  if (params.slug === 'shipping')
    return {
      title: 'Shipping & Returns — AS Store',
      description:
        'Delivery across Lebanon in 2–5 days, delivery charges, and our 3-day return and refund policy.',
      alternates: { canonical: '/pages/shipping' },
    }
  if (params.slug === 'terms')
    return {
      title: 'Terms & Conditions — AS Store',
      description: 'The terms that apply to orders placed on AS Store.',
      alternates: { canonical: '/pages/terms' },
    }
  const page = await loadPage(params.slug)
  return { title: page ? `${page.title} — AS Store` : 'AS Store' }
}

export default async function ContentPage({ params }) {
  params = await params
  // About = the bespoke brand/story page with the brand wall.
  if (params.slug === 'about') {
    const [settings, brands] = await Promise.all([loadSettings(), loadBrands()])
    return <AboutContent settings={settings} brands={brands} />
  }

  // Privacy = the bespoke legal page (kept in code, not the CMS) so it's always
  // live — Google Ads requires a reachable privacy policy.
  if (params.slug === 'privacy') {
    const settings = await loadSettings()
    return <PrivacyPolicy settings={settings} />
  }

  // Shipping & Returns and Terms = bespoke pages, kept in code for the same
  // reason as Privacy: Merchant Center reads them against what the checkout
  // charges, and every figure on them is derived from the same settings the
  // till uses, so a CMS edit can't put them out of step.
  if (params.slug === 'shipping') {
    const settings = await loadSettings()
    return <ShippingReturns settings={settings} />
  }

  if (params.slug === 'terms') {
    const settings = await loadSettings()
    return <TermsConditions settings={settings} />
  }

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
