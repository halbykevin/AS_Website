import { money } from '@/lib/orders'

// Bespoke Terms & Conditions page rendered at /pages/terms. Kept in code like
// the Privacy Policy and Shipping & Returns pages, because Google Merchant
// Center reads it and it must not drift from what the checkout does.
//
// Scope rule for anything written here: every statement is either
//   (a) derived from settings (delivery fee, threshold, VAT rate), or
//   (b) a behaviour the code demonstrably has — server-side pricing, the
//       payment methods actually offered, the quantity cap, "call for price",
//       order cancellation, account deletion, or
//   (c) a rule the store owner confirmed (2-5 day delivery, 3-day refunds).
//
// Deliberately NOT here: governing law, jurisdiction, arbitration, limitation
// of liability, company registration numbers, statutory-rights language. None
// of that exists anywhere in the business's records that this repository can
// see, and inventing a legal clause is worse than omitting one. They are listed
// under LEGAL/BUSINESS INPUT REQUIRED in GOOGLE_MERCHANT_READINESS.md.

const UPDATED = 'August 21, 2026'

const DELIVERY_ESTIMATE = '2–5 days'
const RETURN_DAYS = 3

// Mirrors MAX_QTY in store/cartSlice.js — the cap the bag actually enforces.
const MAX_QTY = 2

function Section({ n, title, children }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-as-ink">
        {n}. {title}
      </h2>
      <div className="mt-3 space-y-3 text-lg leading-relaxed text-as-ink/70">{children}</div>
    </section>
  )
}

export default function TermsConditions({ settings }) {
  const contact = settings?.contact || {}
  const fee = Number(settings?.delivery?.fee ?? 0)
  const freeOver = Number(settings?.delivery?.freeOver ?? 0)
  const vatPercent = Number(settings?.vat?.percent ?? 0)
  const chargesDelivery = Number.isFinite(fee) && fee > 0
  const hasThreshold = chargesDelivery && freeOver > 0

  return (
    <article className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="mx-auto w-full max-w-[760px] px-6">
        <h1 className="text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">
          Terms &amp; Conditions
        </h1>
        <p className="mt-4 text-sm text-as-ink/45">Last updated: {UPDATED}</p>

        <div className="mt-8 space-y-3 text-lg leading-relaxed text-as-ink/70">
          <p>
            These terms cover your use of <span className="whitespace-nowrap">store.as.com.lb</span> and
            the AS Company mobile app, and the orders you place through them. By placing an order you
            accept them.
          </p>
        </div>

        <Section n={1} title="About the store">
          <p>
            AS Store is the online shop of{' '}
            <strong className="font-semibold text-as-ink">AS Company (Absolute Solutions SAL)</strong>, a
            company based in Lebanon and trading in telecommunications and electronics since 2008. The
            website and the mobile app are the same shop: one account, one basket of orders.
          </p>
        </Section>

        <Section n={2} title="Products">
          <p>
            We sell new products. Descriptions, specifications and photographs are provided in good
            faith and are as accurate as we can make them, but a manufacturer can change a
            specification or a finish without telling us, so small differences between a photograph
            and the item delivered are possible.
          </p>
        </Section>

        <Section n={3} title="Prices and currency">
          <p>
            Prices are shown in <strong className="font-semibold text-as-ink">US dollars (USD)</strong> and
            are charged in US dollars. The price shown on a product page is the price of that product.
          </p>
          <p>
            Prices can change. The price that applies to your order is the one shown at the moment you
            place it, and it is recorded on the order — a later change never alters an order that has
            already been placed.
          </p>
          <p>
            Some products are marked{' '}
            <strong className="font-semibold text-as-ink">&ldquo;call for price&rdquo;</strong>. These are not
            sold online: no price is published for them and they cannot be added to a bag. Contact us
            for a quotation.
          </p>
        </Section>

        {vatPercent > 0 && (
          <Section n={4} title="VAT">
            <p>
              <strong className="font-semibold text-as-ink">
                Product prices shown on the site do not include VAT.
              </strong>
            </p>
            <p>
              VAT at <strong className="font-semibold text-as-ink">{vatPercent}%</strong> is calculated at
              checkout and shown as a separate line in the order summary, alongside the delivery
              charge, before you place the order. The total you confirm is the total you pay.
            </p>
          </Section>
        )}

        <Section n={vatPercent > 0 ? 5 : 4} title="Orders">
          <p>
            Placing an order is an offer to buy. We confirm it once we have checked availability; if
            we cannot supply something, we will contact you and you will not be charged for it.
          </p>
          <p>
            The bag allows up to <strong className="font-semibold text-as-ink">{MAX_QTY}</strong> of any one
            product per order. For larger quantities, message us and we will arrange it directly.
          </p>
          <p>
            Every price, delivery charge and tax amount on an order is calculated by our server from
            our own records at the moment the order is created — never from figures sent by your
            browser or the app.
          </p>
        </Section>

        <Section n={vatPercent > 0 ? 6 : 5} title="Payment">
          <p>
            You can pay <strong className="font-semibold text-as-ink">cash on delivery</strong>, or online
            by card through <strong className="font-semibold text-as-ink">Whish Pay</strong>. Card details
            are entered on Whish&rsquo;s own payment page and are never seen or stored by us.
          </p>
          <p>
            An online payment that fails or is abandoned leaves the order unpaid; any discount voucher
            it used is returned to your account.
          </p>
        </Section>

        <Section n={vatPercent > 0 ? 7 : 6} title="Delivery">
          <p>
            We deliver across Lebanon, normally within{' '}
            <strong className="font-semibold text-as-ink">{DELIVERY_ESTIMATE}</strong> of your order being
            confirmed. That is an estimate, not a guaranteed date.
          </p>
          {chargesDelivery ? (
            <p>
              Delivery costs <strong className="font-semibold text-as-ink">{money(fee)}</strong>
              {hasThreshold ? (
                <>
                  , and is <strong className="font-semibold text-as-ink">free on orders of {money(freeOver)}{' '}
                  or more</strong> (an order of exactly {money(freeOver)} qualifies)
                </>
              ) : (
                ' on every order'
              )}
              . Full detail on the{' '}
              <a href="/pages/shipping" className="text-as-red underline hover:no-underline">
                Shipping &amp; Returns
              </a>{' '}
              page.
            </p>
          ) : (
            <p>Delivery is free on every order.</p>
          )}
        </Section>

        <Section n={vatPercent > 0 ? 8 : 7} title="Returns and refunds">
          <p>
            You may request a return and refund within{' '}
            <strong className="font-semibold text-as-ink">{RETURN_DAYS} days of delivery</strong>, and having
            opened the product does not disqualify you. After {RETURN_DAYS} days we are not able to
            offer a refund.
          </p>
          <p>
            The full policy, and how to start a return, is on the{' '}
            <a href="/pages/shipping#returns" className="text-as-red underline hover:no-underline">
              Shipping &amp; Returns
            </a>{' '}
            page.
          </p>
        </Section>

        <Section n={vatPercent > 0 ? 9 : 8} title="Warranty">
          <p>
            Products carry the warranty stated on the{' '}
            <a href="/pages/warranty" className="text-as-red underline hover:no-underline">
              Warranty
            </a>{' '}
            page. A warranty claim is separate from a return: it covers a fault that appears in use,
            with no {RETURN_DAYS}-day limit.
          </p>
        </Section>

        <Section n={vatPercent > 0 ? 10 : 9} title="Cancellations">
          <p>
            To cancel an order, contact us as soon as possible — we can normally do so at any point
            before it goes out for delivery. If the order was paid online and is cancelled, the
            payment is reversed; any points earned on it are removed and any voucher it used is
            returned to your account.
          </p>
        </Section>

        <Section n={vatPercent > 0 ? 11 : 10} title="Accounts, rewards and points">
          <p>
            An account is identified by your mobile number. You are responsible for the details you
            give us being accurate — a wrong number or address is the most common reason an order
            cannot be delivered.
          </p>
          <p>
            AS Points and rewards won in the app have no cash value, are tied to the account that
            earned them, and cannot be transferred or exchanged for money. Points earned on an order
            are withdrawn if that order is cancelled.
          </p>
          <p>
            You can delete your account at any time from the app. Doing so removes your personal
            details; the order records themselves are kept for bookkeeping and warranty, with the
            personal information stripped out. See the{' '}
            <a href="/pages/privacy" className="text-as-red underline hover:no-underline">
              Privacy Policy
            </a>
            .
          </p>
        </Section>

        <Section n={vatPercent > 0 ? 12 : 11} title="Using this website">
          <p>
            The content of this site — text, photographs, logos and design — belongs to AS Company or
            to the manufacturers whose products we sell, and is here so that you can shop. Please do
            not copy it for other purposes, scrape the catalogue, or interfere with the running of the
            site.
          </p>
        </Section>

        <Section n={vatPercent > 0 ? 13 : 12} title="Changes to these terms">
          <p>
            We may update these terms. The version in force for an order is the one published when the
            order was placed, and the date at the top of this page shows when it last changed.
          </p>
        </Section>

        <Section n={vatPercent > 0 ? 14 : 13} title="Contact">
          <p>Questions about these terms, an order, or a return:</p>
          <ul className="space-y-1">
            {contact.email && (
              <li>
                Email:{' '}
                <a href={`mailto:${contact.email}`} className="text-as-red underline hover:no-underline">
                  {contact.email}
                </a>
              </li>
            )}
            {contact.phone && <li>Phone: {contact.phone}</li>}
            {contact.address && <li>Address: {contact.address}</li>}
            <li>
              Or use the{' '}
              <a href="/pages/contact" className="text-as-red underline hover:no-underline">
                contact form
              </a>
              .
            </li>
          </ul>
        </Section>
      </div>
    </article>
  )
}
