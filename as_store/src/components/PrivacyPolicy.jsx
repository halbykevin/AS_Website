// Bespoke Privacy Policy page rendered at /pages/privacy. Kept in code (not the
// CMS) so a required-for-ads legal page is always live regardless of DB content.
// Contact details are pulled from CMS settings when available.

const UPDATED = 'July 15, 2026'

function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-as-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-lg leading-relaxed text-as-ink/70">{children}</div>
    </section>
  )
}

export default function PrivacyPolicy({ settings }) {
  const contact = settings?.contact || {}
  const email = contact.email || 'info@as.com.lb'
  const phone = contact.phone
  const address = contact.address

  return (
    <article className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="mx-auto w-full max-w-[760px] px-6">
        <h1 className="text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">Privacy Policy</h1>
        <p className="mt-4 text-sm text-as-ink/45">Last updated: {UPDATED}</p>

        <div className="mt-8 space-y-3 text-lg leading-relaxed text-as-ink/70">
          <p>
            AS Store is operated by AS Company (Absolute Solutions SAL), a company based in Lebanon. This
            Privacy Policy explains what information we collect when you use{' '}
            <span className="whitespace-nowrap">store.as.com.lb</span>, how we use it, and the choices you
            have. By using the store you agree to the practices described below.
          </p>
        </div>

        <Section title="Information we collect">
          <p>We collect the information you give us and some information that is gathered automatically.</p>
          <p>
            <strong className="font-semibold text-as-ink">Information you provide.</strong> When you place an
            order or create an account, we collect your full name, mobile number, email address (optional),
            delivery address, and any notes you add to your order. Because we deliver on a cash-on-delivery
            basis, we do not collect or store card or bank payment details.
          </p>
          <p>
            <strong className="font-semibold text-as-ink">Information collected automatically.</strong> Like
            most websites, we automatically receive standard technical data such as your device type, browser,
            and pages viewed. We use cookies and similar technologies, including analytics tools such as Google
            Analytics, to understand how the store is used and to improve it.
          </p>
        </Section>

        <Section title="How we use your information">
          <p>We use the information we collect to:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Process, confirm, and deliver your orders;</li>
            <li>Contact you about your order, delivery, or warranty questions;</li>
            <li>Let you sign in with your mobile number and track your orders;</li>
            <li>Provide customer support;</li>
            <li>Operate, secure, and improve the store; and</li>
            <li>Comply with our legal obligations.</li>
          </ul>
        </Section>

        <Section title="How we share your information">
          <p>
            We do not sell your personal information. We share it only as needed to run the store — for
            example, with the delivery courier that brings your order to you, and with service providers who
            help us operate the site (such as hosting and analytics providers). We may also disclose
            information where required by law.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            We use essential cookies that are needed for the store to work (for example, to remember the items
            in your bag) and analytics cookies that help us understand usage. You can control or delete cookies
            through your browser settings; disabling essential cookies may affect how the store works.
          </p>
        </Section>

        <Section title="Data retention">
          <p>
            We keep order and account information for as long as your account is active and as needed to
            provide the store, resolve disputes, honor warranties, and meet legal requirements. You can ask us
            to delete your information at any time (see “Your rights” below).
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You may ask us to access, correct, or delete the personal information we hold about you, or to stop
            contacting you. To make a request, contact us using the details below and we will respond within a
            reasonable time.
          </p>
        </Section>

        <Section title="Security">
          <p>
            We take reasonable technical and organizational measures to protect your information. No method of
            transmission or storage is completely secure, but we work to keep your data safe and limit access
            to it.
          </p>
        </Section>

        <Section title="Children">
          <p>
            The store is intended for adults. We do not knowingly collect personal information from children.
            If you believe a child has provided us information, please contact us and we will remove it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time. When we do, we will change the “Last updated”
            date above. Please review this page periodically.
          </p>
        </Section>

        <Section title="Contact us">
          <p>If you have any questions about this Privacy Policy or your information, contact us:</p>
          <ul className="space-y-1">
            <li>
              Email:{' '}
              <a href={`mailto:${email}`} className="text-as-red underline hover:no-underline">
                {email}
              </a>
            </li>
            {phone && <li>Phone: {phone}</li>}
            {address && <li>Address: {address}</li>}
          </ul>
        </Section>
      </div>
    </article>
  )
}
