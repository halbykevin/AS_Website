import ContactForm from './ContactForm.jsx'
import Icon from './Icon.jsx'

// Shared contact block: heading + email form + WhatsApp button + contact
// details. Rendered by both /contact and /pages/support. `settings` supplies
// the contact info; `eyebrow`/`title`/`subtitle` let each page label it.
export default function ContactBody({ settings, eyebrow = 'Get in touch', title, subtitle }) {
  const contact = settings?.contact || {}
  const waDigits = String(contact.whatsapp || '').replace(/\D/g, '')
  const waHref = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent("Hi AS Store! I'd like to ask about ")}`
    : ''

  return (
    <div className="shell-wide">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-as-red">{eyebrow}</p>
        )}
        <h1 className="mt-3 text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-4 text-lg text-as-ink/60">{subtitle}</p>}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Email form */}
        <ContactForm />

        {/* WhatsApp + contact details */}
        <div className="space-y-4">
          <div className="rounded-[28px] border border-as-ink/10 bg-white p-6 sm:p-8">
            <h2 className="text-lg font-semibold tracking-apple text-as-ink">Chat on WhatsApp</h2>
            <p className="mt-2 text-sm text-as-ink/60">The fastest way to reach us. Tap below to open a chat.</p>
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 font-semibold text-white transition hover:brightness-95"
              >
                <Icon name="whatsapp" className="h-5 w-5" strokeWidth={2} />
                Message us on WhatsApp
              </a>
            ) : (
              <p className="mt-4 text-sm text-as-ink/40">WhatsApp number not set yet.</p>
            )}
          </div>

          {(contact.email || contact.phone || contact.address) && (
            <div className="space-y-4 rounded-[28px] border border-as-ink/10 bg-white p-6 sm:p-8">
              {contact.phone && (
                <ContactRow label="Phone">
                  <a href={`tel:${contact.phone}`} className="hover:text-as-red">{contact.phone}</a>
                </ContactRow>
              )}
              {contact.email && (
                <ContactRow label="Email">
                  <a href={`mailto:${contact.email}`} className="hover:text-as-red">{contact.email}</a>
                </ContactRow>
              )}
              {contact.address && <ContactRow label="Address">{contact.address}</ContactRow>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ContactRow({ label, children }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-as-red">{label}</p>
      <p className="mt-0.5 break-words text-as-ink/80">{children}</p>
    </div>
  )
}
