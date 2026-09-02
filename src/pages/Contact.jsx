import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { useContent } from '../store/content.jsx'
import { sendContactMessage, whatsappContactUrl } from '../lib/api.js'
import { contact as contactDefaults } from '../content/site.js'
import EventsLink from '../components/EventsLink.jsx'

// The public contact page: three one-tap channels (WhatsApp, Instagram, email)
// and a message form that posts to /api/contact — the API stores the message and
// emails it to the staff inbox. Reached from the "Contact" nav item and footer.
export default function Contact() {
  const { contact, brand, whatsappNumber } = useContent()
  const copy = { ...contactDefaults.page, ...(contact.page || {}) }

  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '', website: '' })
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState('')

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const whatsappHref = whatsappContactUrl(whatsappNumber, contact.whatsapp)
  // If the form ever fails, offer the same message over WhatsApp instead.
  const whatsappWithMessage = whatsappContactUrl(
    whatsappNumber,
    contact.whatsapp,
    form.message
      ? `Hello 👋 ${form.message}${form.name ? `\n\n— ${form.name}` : ''}`
      : undefined
  )

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setStatus('sending')
    try {
      await sendContactMessage(form)
      setStatus('sent')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  const reset = () => {
    setForm({ name: '', email: '', phone: '', subject: '', message: '', website: '' })
    setStatus('idle')
    setError('')
  }

  return (
    <div className="bg-white">
      {/* ================= HEADER ================= */}
      <section className="relative overflow-hidden border-b border-black/5 bg-gradient-to-b from-as-red/[0.06] to-white px-5 pb-12 pt-14 sm:px-8 sm:pb-16 sm:pt-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(164,30,34,0.18) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, black, transparent)',
          }}
        />
        <div className="relative mx-auto max-w-5xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-as-red sm:text-sm">
            {copy.eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-as-charcoal sm:text-6xl">
            {contact.heading || copy.title}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-as-charcoal/60 sm:text-base">
            {contact.subheading || copy.intro}
          </p>
        </div>
      </section>

      {/* ================= CHANNELS + FORM ================= */}
      <section className="px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12">
          {/* --- Quick channels --- */}
          <div className="space-y-3 sm:space-y-4">
            {whatsappHref && (
              <ChannelCard
                href={whatsappHref}
                external
                accent="#25D366"
                label="WhatsApp"
                value="Chat with us now"
                hint="Fastest reply — we're on WhatsApp every day."
                icon={<WhatsAppIcon className="h-6 w-6" />}
              />
            )}

            {contact.email && (
              <ChannelCard
                href={`mailto:${contact.email}`}
                accent="#A41E22"
                label="Email"
                value={contact.email}
                hint="Send us the details and we'll come back to you."
                icon={<Icon name="mail" className="h-6 w-6" />}
              />
            )}

            {contact.instagram && (
              <ChannelCard
                href={contact.instagram}
                external
                accent="#C13584"
                label="Instagram"
                value={contact.instagramHandle || 'Follow us'}
                hint="See what's new, and DM us anytime."
                icon={<InstagramIcon className="h-6 w-6" />}
              />
            )}

            <div className="rounded-2xl border border-black/[0.06] bg-as-charcoal/[0.03] p-5 sm:p-6">
              <p className="text-sm font-bold text-as-charcoal">{brand.name}</p>
              <p className="mt-1 text-sm leading-relaxed text-as-charcoal/55">{brand.tagline}</p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
                <EventsLink className="text-as-red transition hover:text-as-red-light">
                  Browse events →
                </EventsLink>
                <Link to="/what-we-do" className="text-as-red transition hover:text-as-red-light">
                  What we do →
                </Link>
              </div>
            </div>
          </div>

          {/* --- Message form --- */}
          <div className="rounded-3xl border border-black/[0.06] bg-white p-6 shadow-xl shadow-black/[0.04] sm:p-8">
            {status === 'sent' ? (
              <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-as-red/10 text-as-red">
                  <Icon name="check" className="h-9 w-9" />
                </span>
                <h2 className="mt-6 text-2xl font-extrabold tracking-tight text-as-charcoal">
                  Message sent
                </h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-as-charcoal/60">
                  {copy.success}
                </p>
                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-full bg-as-red px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light"
                  >
                    Send another message
                  </button>
                  <Link
                    to="/"
                    className="rounded-full border border-black/10 px-6 py-3 text-sm font-semibold text-as-charcoal transition hover:border-as-red/30 hover:text-as-red"
                  >
                    Back to home
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate>
                <h2 className="text-xl font-extrabold tracking-tight text-as-charcoal sm:text-2xl">
                  {copy.formHeading}
                </h2>
                <p className="mt-1.5 text-sm text-as-charcoal/55">{copy.formNote}</p>

                <div className="mt-6 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Your name" required>
                      <input
                        type="text"
                        value={form.name}
                        onChange={set('name')}
                        required
                        autoComplete="name"
                        placeholder="Full name"
                        className={inputCls}
                      />
                    </FormField>
                    <FormField label="Email" required>
                      <input
                        type="email"
                        value={form.email}
                        onChange={set('email')}
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                        className={inputCls}
                      />
                    </FormField>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Phone / WhatsApp" hint="Optional">
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={set('phone')}
                        autoComplete="tel"
                        placeholder="+961 …"
                        className={inputCls}
                      />
                    </FormField>
                    <FormField label="Subject" hint="Optional">
                      <input
                        type="text"
                        value={form.subject}
                        onChange={set('subject')}
                        placeholder="What is it about?"
                        className={inputCls}
                      />
                    </FormField>
                  </div>

                  <FormField label="Message" required>
                    <textarea
                      value={form.message}
                      onChange={set('message')}
                      required
                      rows={5}
                      placeholder="How can we help?"
                      className={`${inputCls} min-h-[130px] resize-y`}
                    />
                  </FormField>

                  {/* Honeypot — hidden from people, tempting to bots. */}
                  <input
                    type="text"
                    name="website"
                    value={form.website}
                    onChange={set('website')}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="pointer-events-none absolute h-0 w-0 opacity-0"
                  />
                </div>

                {status === 'error' && (
                  <div className="mt-5 rounded-xl bg-as-red/[0.07] px-4 py-3 text-sm text-as-red">
                    <p className="font-semibold">{error}</p>
                    {whatsappWithMessage && (
                      <a
                        href={whatsappWithMessage}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block font-semibold underline underline-offset-2"
                      >
                        Send it on WhatsApp instead →
                      </a>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="mt-6 w-full rounded-full bg-as-red px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-as-red/25 transition hover:bg-as-red-light hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'sending' ? 'Sending…' : 'Send message'}
                </button>

                {whatsappHref && (
                  <p className="mt-4 text-center text-xs text-as-charcoal/50">
                    Prefer to chat?{' '}
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-as-red hover:underline"
                    >
                      Message us on WhatsApp
                    </a>
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-as-charcoal outline-none transition placeholder:text-as-charcoal/35 focus:border-as-red focus:ring-2 focus:ring-as-red/20'

function FormField({ label, hint, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1.5">
        <span className="text-sm font-semibold text-as-charcoal">{label}</span>
        {required && <span className="text-as-red">*</span>}
        {hint && <span className="text-xs font-normal text-as-charcoal/40">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

// One tappable contact channel. The icon tile takes the channel's brand colour;
// everything else stays in the site's palette.
function ChannelCard({ href, external, accent, label, value, hint, icon }) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="group flex items-center gap-4 rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-as-red/20 hover:shadow-xl hover:shadow-black/[0.06] sm:p-6"
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-transform duration-300 group-hover:scale-105"
        style={{ backgroundColor: accent }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase tracking-[0.14em] text-as-charcoal/45">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-base font-bold text-as-charcoal">{value}</span>
        {hint && <span className="mt-1 block text-xs leading-relaxed text-as-charcoal/50">{hint}</span>}
      </span>
      <Icon
        name="arrow"
        className="h-5 w-5 shrink-0 text-as-charcoal/25 transition-all duration-300 group-hover:translate-x-1 group-hover:text-as-red"
      />
    </a>
  )
}

function WhatsAppIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function InstagramIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  )
}
