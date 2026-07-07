import ContactBody from '@/components/ContactBody.jsx'
import { loadSettings } from '@/lib/site'

export const metadata = { title: 'Contact us — AS Store' }

// Contact page: an email form (→ POST /api/contact) plus a WhatsApp quick-chat
// button and the shop's contact details, all pulled from CMS settings.
export default async function ContactPage() {
  const settings = await loadSettings()
  return (
    <section className="bg-as-bg pb-24 pt-28 sm:pt-32">
      <ContactBody
        settings={settings}
        title="We'd love to hear from you"
        subtitle="Questions about a product, an order, or bulk pricing? Send us a message and we'll reply as soon as we can — or chat with us instantly on WhatsApp."
      />
    </section>
  )
}
