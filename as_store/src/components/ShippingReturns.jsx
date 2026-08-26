import { money } from '@/lib/orders'

// Bespoke Shipping & Returns page rendered at /pages/shipping. Kept in code
// rather than the CMS, for the same reason the Privacy Policy is: Google
// Merchant Center reads this page and compares it with what the checkout
// actually charges, so it must not be editable into disagreement by accident.
//
// The important part is that every number here is DERIVED, not typed:
//
//   delivery fee + free-delivery threshold  <- settings.delivery
//   VAT rate                                <- settings.vat
//
// which are the very same settings rows the checkout and POST /api/orders read
// (deliveryFeeFor / vatAmountFor in server/src/app.js). Change the fee in the
// admin and this page changes with it. Nothing can be stated here that the
// till does not do.
//
// The delivery ESTIMATE is the one thing no setting holds, so it is a constant
// — confirmed by the store owner (2026-08-21): 2-5 days.
//
// The RETURN terms live in lib/returnPolicy.js instead of here, because this
// page is no longer the only thing that states them: the MerchantReturnPolicy
// structured data in lib/seo.js says the same window and the same cost to
// Google, and /pages/terms summarises them. One module, several consumers.

import { RETURN_DAYS } from '@/lib/returnPolicy'

const UPDATED = 'August 26, 2026'

// Owner-confirmed, and not derivable from anything in the database.
const DELIVERY_ESTIMATE = '2–5 days'

function Section({ id, title, children }) {
  return (
    <section id={id} className="mt-10 scroll-mt-28">
      <h2 className="text-xl font-semibold text-as-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-lg leading-relaxed text-as-ink/70">{children}</div>
    </section>
  )
}

export default function ShippingReturns({ settings }) {
  const contact = settings?.contact || {}
  const fee = Number(settings?.delivery?.fee ?? 0)
  const freeOver = Number(settings?.delivery?.freeOver ?? 0)
  const vatPercent = Number(settings?.vat?.percent ?? 0)

  // Mirrors deliveryFeeFor(): a fee of 0 means delivery is always free, and a
  // threshold of 0 means the fee applies to every order. Saying it in prose the
  // same way the function decides it is what keeps the two honest.
  const chargesDelivery = Number.isFinite(fee) && fee > 0
  const hasThreshold = chargesDelivery && freeOver > 0

  // The boundary is `subtotal >= freeOver` in BOTH the client summary and the
  // server that actually charges, so an order of exactly the threshold ships
  // free. Worth stating out loud rather than leaving a shopper to guess which
  // side of "over $100" they are on.
  const wa = String(contact.whatsapp || '').replace(/\D/g, '')

  // Where a return is handed over. Read from Site Settings -> Contact rather
  // than typed, so a move does not leave a shopper at the old counter. The copy
  // reads correctly with or without it.
  const address = String(contact.address || '').trim()

  return (
    <article className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="mx-auto w-full max-w-[760px] px-6">
        <h1 className="text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">
          Shipping &amp; Returns
        </h1>
        <p className="mt-4 text-sm text-as-ink/45">Last updated: {UPDATED}</p>

        <div className="mt-8 space-y-3 text-lg leading-relaxed text-as-ink/70">
          <p>
            AS Store delivers across Lebanon. This page explains what delivery costs, how long it
            takes, and how to return something you have changed your mind about — including what a
            return costs you.
          </p>
        </div>

        <Section id="delivery" title="Delivery time">
          <p>
            <strong className="font-semibold text-as-ink">Estimated delivery: {DELIVERY_ESTIMATE}</strong>{' '}
            from the day your order is confirmed, anywhere in Lebanon.
          </p>
          <p>
            This is an estimate rather than a guarantee — a remote address or a public holiday can add
            a day. If your order is taking longer than expected, message us and we will tell you where
            it is.
          </p>
        </Section>

        <Section id="delivery-cost" title="Delivery cost">
          {chargesDelivery ? (
            <>
              <ul className="space-y-2">
                {hasThreshold && (
                  <li>
                    Orders of <strong className="font-semibold text-as-ink">{money(freeOver)} or more</strong>{' '}
                    — <strong className="font-semibold text-as-ink">free delivery</strong>.
                  </li>
                )}
                <li>
                  Orders {hasThreshold ? <>under {money(freeOver)}</> : <>of any value</>} —{' '}
                  <strong className="font-semibold text-as-ink">{money(fee)}</strong> delivery.
                </li>
              </ul>
              {hasThreshold && (
                <p>
                  An order of exactly {money(freeOver)} ships free — the threshold is inclusive. The
                  amount compared against it is the total of the items in your bag, before delivery
                  {vatPercent > 0 ? ' and before VAT' : ''}.
                </p>
              )}
            </>
          ) : (
            <p>
              <strong className="font-semibold text-as-ink">Delivery is free</strong> on every order.
            </p>
          )}
          <p>
            Whatever you are charged is shown on its own line in the order summary at checkout, before
            you place the order.
          </p>
        </Section>

        <Section id="prices-and-vat" title="Prices and VAT">
          <p>
            All prices on this site are shown in{' '}
            <strong className="font-semibold text-as-ink">US dollars (USD)</strong>, and the price you
            see on a product page is the price of the product itself.
          </p>
          {vatPercent > 0 && (
            <p>
              <strong className="font-semibold text-as-ink">
                VAT ({vatPercent}%) is not included in the displayed product price.
              </strong>{' '}
              It is calculated at checkout and shown as its own line in the order summary, together
              with the delivery charge, so you can see the full amount before you place the order.
            </p>
          )}
        </Section>

        <Section id="returns" title="Returns and refunds">
          <p>
            <strong className="font-semibold text-as-ink">
              You have {RETURN_DAYS} days from the day your order is delivered
            </strong>{' '}
            to ask us for a return and a refund.
          </p>
          <p>
            <strong className="font-semibold text-as-ink">Opening the product does not lose you that
            right.</strong>{' '}
            If you have unboxed the item and tried it, you are still eligible for a refund, as long as
            your request reaches us inside the {RETURN_DAYS}-day window.
          </p>
          <p>
            <strong className="font-semibold text-as-ink">
              After {RETURN_DAYS} days we are not able to offer a refund.
            </strong>{' '}
            A fault that appears later is a warranty matter rather than a return — see{' '}
            <a href="/pages/warranty" className="text-as-red underline hover:no-underline">
              Warranty
            </a>
            .
          </p>
        </Section>

        {/*
          Stated as its own section, with its own heading, on purpose. Google
          Merchant Center grades "return cost" separately from "return window",
          and a policy that leaves the cost implied — or answers it with "contact
          us" — is scored as incomplete even when the window is verified. It is
          also simply the question a shopper asks second.
        */}
        <Section id="return-cost" title="Return cost">
          <p>
            <strong className="font-semibold text-as-ink">Returning a product is free.</strong>{' '}
            You bring it back to us in person{address ? <> at {address}</> : null}, so there is
            nothing to pay to make the return, and nothing is taken off your refund to cover it.
          </p>
          <p>This applies anywhere in Lebanon and to every product on the site.</p>
        </Section>

        <Section id="how-to-return" title="How to start a return">
          <p>
            Contact us within the {RETURN_DAYS} days with your order number and tell us what you would
            like to return. We will confirm the details with you, and you then bring the product to us
            in person{address ? <> at {address}</> : null}, where your refund is issued.
          </p>
          <ul className="space-y-1">
            {wa && (
              <li>
                WhatsApp:{' '}
                <a
                  href={`https://wa.me/${wa}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-as-red underline hover:no-underline"
                >
                  {contact.whatsapp}
                </a>
              </li>
            )}
            {contact.email && (
              <li>
                Email:{' '}
                <a href={`mailto:${contact.email}`} className="text-as-red underline hover:no-underline">
                  {contact.email}
                </a>
              </li>
            )}
            {contact.phone && <li>Phone: {contact.phone}</li>}
            <li>
              Or use the{' '}
              <a href="/pages/contact" className="text-as-red underline hover:no-underline">
                contact form
              </a>
              .
            </li>
          </ul>
        </Section>

        <Section id="warranty" title="Warranty">
          <p>
            Returns and warranty are two different things. The return window above is for changing
            your mind; a product that develops a fault is covered separately — see the{' '}
            <a href="/pages/warranty" className="text-as-red underline hover:no-underline">
              Warranty page
            </a>
            .
          </p>
        </Section>
      </div>
    </article>
  )
}
