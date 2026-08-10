// Bespoke Privacy Policy page rendered at /pages/privacy. Kept in code (not the
// CMS) so a required-for-ads legal page is always live regardless of DB content.
// Contact details are pulled from CMS settings when available.
//
// This is also the policy the **mobile app** links to (Privacy & legal in the
// account tab) and the URL given to Google Play and the App Store, so it has to
// describe the app's data too — push tokens, device info, the in-app account
// deletion. One canonical text, two products: if you change what either one
// collects, this page is part of that change.

const UPDATED = 'August 10, 2026'

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
            <span className="whitespace-nowrap">store.as.com.lb</span> or the{' '}
            <strong className="font-semibold text-as-ink">AS Company mobile app</strong> for Android and iOS,
            how we use it, and the choices you have. Both are run by the same company and share the same
            accounts and orders, so this policy covers them together; where something applies to only one of
            them, we say so. By using the store or the app you agree to the practices described below.
          </p>
        </div>

        <Section title="Information we collect">
          <p>We collect the information you give us and some information that is gathered automatically.</p>
          <p>
            <strong className="font-semibold text-as-ink">Information you provide.</strong> When you place an
            order or create an account, we collect your full name, mobile number, email address (optional),
            delivery address, and any notes you add to your order. If you sign in with Google, we receive your
            name and email address from Google — never your Google password. If you enter one of our games or
            prize draws, we keep the entry you submitted along with the name and mobile number you gave.
          </p>
          <p>
            <strong className="font-semibold text-as-ink">Information collected automatically.</strong> On the
            website we automatically receive standard technical data such as your device type, browser, and
            pages viewed, and we use cookies and similar technologies, including analytics tools such as Google
            Analytics, to understand how the store is used and to improve it.
          </p>
          <p>
            <strong className="font-semibold text-as-ink">In the mobile app.</strong> If you allow
            notifications, we store the push token your device's operating system issues to us, together with
            the platform (Android or iOS), the app version, and your language setting, so we can send you order
            updates and — if you have not turned them off — occasional offers. A push token identifies a device
            installation, not you personally, and it stops working when you turn notifications off or uninstall
            the app. The app does not use advertising identifiers and does not track you across other companies'
            apps or websites.
          </p>
        </Section>

        <Section title="Payments">
          <p>
            You can pay cash on delivery or online with Whish Pay. Choosing to pay online sends you to Whish's
            own secure payment page to complete the payment. Your card, wallet, or bank details are entered
            there and are handled by Whish under their own privacy policy —{' '}
            <strong className="font-semibold text-as-ink">we never see or store them</strong>. What we receive
            back is confirmation of whether the payment for your order succeeded, which we keep with the order.
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
            We do not sell your personal information. We share it only as needed to run the store — with the
            delivery courier that brings your order to you, with Whish Pay when you choose to pay online, with
            the push notification service that delivers messages to your device, and with service providers who
            help us operate the site and the app (such as hosting and analytics providers). We may also
            disclose information where required by law.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            On the website we use essential cookies that are needed for the store to work (for example, to
            remember the items in your bag) and analytics cookies that help us understand usage. You can
            control or delete cookies through your browser settings; disabling essential cookies may affect how
            the store works. The mobile app does not use cookies — it stores your sign-in securely on your own
            device, and removing the app removes it.
          </p>
        </Section>

        <Section title="Notifications">
          <p>
            The app asks for permission before sending you any notification, and you can withdraw that
            permission at any time in your device settings. Inside the app,{' '}
            <strong className="font-semibold text-as-ink">Account → Notification settings</strong> lets you
            choose which kinds you receive and set quiet hours. Order updates and promotional messages are
            controlled separately, so you can switch off offers and still be told when your order is on its
            way. Signing out stops notifications tied to your account on that device.
          </p>
        </Section>

        <Section title="Data retention">
          <p>
            We keep order and account information for as long as your account is active and as needed to
            provide the store, resolve disputes, honor warranties, and meet legal requirements. You can delete
            your account at any time (see “Deleting your account” below).
          </p>
        </Section>

        <Section title="Deleting your account">
          <p>
            You can delete your account yourself, from the app or by asking us. In the app, go to{' '}
            <strong className="font-semibold text-as-ink">Account → Delete account</strong> and confirm. On the
            website, or if you no longer have the app installed, email us at{' '}
            <a href={`mailto:${email}`} className="text-as-red underline hover:no-underline">
              {email}
            </a>{' '}
            from the address on your account, or message us on WhatsApp from the mobile number on your account,
            and we will delete it for you.
          </p>
          <p>
            Deleting your account permanently removes your name, mobile number, email address, saved delivery
            addresses, sign-in history, notification settings and push tokens, rewards and prize-draw entries,
            and any unused vouchers. It cannot be undone, and it stops all notifications to your devices.
          </p>
          <p>
            We keep the record of orders you already placed — the items, amounts, and dates — because Lebanese
            accounting rules require it and because refunds and warranty claims are settled against that
            record. Your personal details are removed from those orders, so what remains is a sale, not a
            customer. If an order is still on its way we will ask you to wait until it has been delivered or
            cancelled before deleting, since we cannot deliver a parcel whose address we have just erased.
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
