// The return policy, in one place.
//
// Three things have to say the same thing about returns, or Google treats the
// difference as a misrepresentation:
//
//   1. /pages/shipping   - the page a shopper (and a Merchant Center reviewer)
//                          reads. components/ShippingReturns.jsx
//   2. /pages/terms      - the summary clause. components/TermsConditions.jsx
//   3. MerchantReturnPolicy structured data, emitted on the Organization and on
//      every product Offer. lib/seo.js
//
// This is the same trick lib/merchant.js plays for price and availability: one
// derivation, several consumers, so they cannot be caught disagreeing. Nothing
// here is derived from settings, because no settings row holds it — these are
// business rules the store owner confirms, and the dates below are when.
//
// Confirmed by the store owner:
//   2026-08-21  3 days from delivery; opening the product does not void it
//   2026-08-26  returns are made in person at an AS shop, free of charge
//
// This module imports nothing on purpose. lib/seo.js imports it, and seo.js is
// already in a deliberate cycle with lib/merchant.js — an import back the other
// way would turn that into a temporal-dead-zone crash at module load.

// Days from DELIVERY, not from the order or from opening the box. Google's
// return window has no other basis, and "days after the customer opened it" is
// not a thing anyone can verify.
export const RETURN_DAYS = 3

// Returns happen at the counter, so a return costs the customer nothing. This
// is what fills Merchant Center's return-cost field: "customer responsibility"
// with no amount reads as missing data, and a policy that sends people to
// "contact us" for the cost fails its completeness review.
export const RETURN_IS_FREE = true

// ISO 3166-1 alpha-2. The store delivers in Lebanon only.
export const RETURN_COUNTRY = 'LB'

// schema.org MerchantReturnPolicy for the policy above.
//
// `url` is the storefront origin; it is passed in rather than imported so this
// module stays dependency-free (see the note at the top). Google's precedence
// rule is that Merchant Center account settings override this markup, so the
// markup's job is the organic free listings — the two must still agree.
export function merchantReturnPolicyJsonLd(url = '') {
  const link = url ? `${url}/pages/shipping#returns` : '/pages/shipping#returns'
  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: RETURN_COUNTRY,
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: RETURN_DAYS,
    returnMethod: 'https://schema.org/ReturnInStore',
    returnFees: RETURN_IS_FREE
      ? 'https://schema.org/FreeReturn'
      : 'https://schema.org/ReturnFeesCustomerResponsibility',
    merchantReturnLink: link,
  }
}
