// The store's FAQ — the questions, and answers built from what the store
// actually does.
//
// Nothing here is typed as a figure. The same rule as /pages/shipping: the
// delivery fee, the free-delivery threshold and VAT come from the settings the
// checkout charges by; the return window from lib/returnPolicy.js; the
// delivery estimate from ShippingReturns; the payment methods are the ones
// /pages/terms states; the address, phone and opening hours are the ones in
// Site Settings. An FAQ is the page answer engines quote word for word, so it
// must not be able to say something the till or the counter would contradict.
//
// One function feeds both the visible page (app/(store)/faq) and its FAQPage
// structured data, so the two can never disagree — Google requires the markup
// to match what the page shows.

import { money } from './orders'
import { RETURN_DAYS, RETURN_IS_FREE } from './returnPolicy'
import { hoursSentence } from './hours'
import { DELIVERY_ESTIMATE } from '@/components/ShippingReturns.jsx'

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()

const AWARD_ON = {
  delivered: 'once the order is delivered',
  confirmed: 'once the order is confirmed',
  created: 'as soon as the order is placed',
}

/**
 * [{ title, items: [{ id, q, a: [paragraph…], links: [{ href, label }] }] }]
 * `a` is plain text — it is what the page prints and what the markup says.
 */
export function storeFaq(settings = {}, wallet = {}) {
  const contact = settings.contact || {}
  const address = clean(contact.address)
  const hours = hoursSentence(settings.hours)
  const fee = Number(settings.delivery?.fee ?? 0)
  const freeOver = Number(settings.delivery?.freeOver ?? 0)
  const vat = Number(settings.vat?.percent ?? 0)
  const wa = String(contact.whatsapp || '').replace(/\D/g, '')
  const cfp = settings.callForPrice || {}

  const groups = []

  const visit = []
  if (address) {
    visit.push({
      id: 'where',
      q: 'Where is AS Store?',
      a: [
        `AS Store's shop is in ${address}. It is also where returns are made, in person.`,
      ],
    })
  }
  if (hours) {
    visit.push({
      id: 'hours',
      q: 'What are AS Store’s opening hours?',
      a: [`${hours} All times are Lebanon time.`],
    })
  }
  visit.push({
    id: 'company',
    q: 'Is AS Store part of AS Company?',
    a: [
      'Yes. AS Store is the online shop of AS Company (Absolute Solutions SAL), Lebanon’s market leader in ' +
        'telecommunication and electronics since 2008.',
    ],
    links: [{ href: 'https://www.as.com.lb', label: 'Visit AS Company' }],
  })
  groups.push({ title: 'The shop', items: visit })

  // Mirrors ShippingReturns / deliveryFeeFor(): a fee of 0 = always free, a
  // threshold of 0 = the fee applies to every order, and the threshold is
  // inclusive and measured on the items before delivery and VAT.
  const deliveryCost =
    fee > 0
      ? freeOver > 0
        ? `Delivery is ${money(fee)} on orders under ${money(freeOver)}, and free on orders of ${money(freeOver)} ` +
          `or more. The amount compared is the total of the items in your bag, before delivery${vat > 0 ? ' and VAT' : ''}.`
        : `Delivery is ${money(fee)} on every order.`
      : 'Delivery is free on every order.'

  groups.push({
    title: 'Delivery',
    items: [
      {
        id: 'deliver-lebanon',
        q: 'Does AS Store deliver across Lebanon?',
        a: [
          `Yes — AS Store delivers anywhere in Lebanon. Delivery takes an estimated ${DELIVERY_ESTIMATE} from the day ` +
            'your order is confirmed.',
        ],
      },
      {
        id: 'delivery-cost',
        q: 'How much does delivery cost?',
        a: [deliveryCost, 'Whatever you are charged is shown on its own line at checkout, before you place the order.'],
        links: [{ href: '/pages/shipping', label: 'Shipping & Returns' }],
      },
    ],
  })

  groups.push({
    title: 'Prices & payment',
    items: [
      {
        id: 'prices-vat',
        q: 'Are prices in US dollars, and do they include VAT?',
        a: [
          vat > 0
            ? `Prices are in US dollars (USD). VAT (${vat}%) is not included in the product price — it is added at ` +
              'checkout and shown on its own line, together with the delivery charge.'
            : 'Prices are in US dollars (USD), and no VAT is added at checkout.',
        ],
      },
      {
        id: 'payment',
        q: 'How can I pay?',
        a: [
          'Cash on delivery, or online by card through Whish Pay. Card details are entered on Whish’s own ' +
            'payment page and are never seen or stored by AS Store.',
        ],
      },
      {
        id: 'call-for-price',
        q: `Why do some products say “${clean(cfp.label) || 'Call for price'}”?`,
        a: [
          `Some products show “${clean(cfp.label) || 'Call for price'}” instead of a price. Tap ` +
            `“${clean(cfp.button) || 'Ask for a price'}” and we will reply on WhatsApp with the current price.`,
        ],
      },
    ],
  })

  groups.push({
    title: 'Returns',
    items: [
      {
        id: 'returns',
        q: 'Can I return a product?',
        a: [
          `Yes, within ${RETURN_DAYS} days of delivery — even if you have opened it. ` +
            `Returns are made in person${address ? ` at our shop in ${address}` : ' at our shop'}` +
            `${RETURN_IS_FREE ? ', cost nothing, and' : ', and'} the refund is issued there.`,
        ],
        links: [{ href: '/pages/shipping#returns', label: 'Returns policy' }],
      },
      {
        id: 'late-fault',
        q: `What if a product develops a fault after ${RETURN_DAYS} days?`,
        a: [`After ${RETURN_DAYS} days a fault is a warranty matter rather than a return. Contact us and we will help.`],
        links: [{ href: '/pages/warranty', label: 'Warranty' }],
      },
    ],
  })

  if (wallet.enabled && wallet.earnPercent > 0) {
    groups.push({
      title: 'AS Wallet',
      items: [
        {
          id: 'wallet',
          q: 'What is AS Wallet?',
          a: [
            `Store credit you earn by shopping: ${wallet.earnPercent}% of what you spend on products comes back to ` +
              `your AS Wallet ${AWARD_ON[wallet.awardOn] || AWARD_ON.delivered}, and you can spend it at checkout ` +
              'on a later order.',
          ],
        },
      ],
    })
  }

  const channels = [
    wa && `WhatsApp: +${wa}`,
    contact.phone && `Phone: ${clean(contact.phone)}`,
    contact.email && `Email: ${clean(contact.email)}`,
  ].filter(Boolean)
  groups.push({
    title: 'Contact',
    items: [
      {
        id: 'contact',
        q: 'How do I contact AS Store?',
        a: [
          channels.length
            ? `${channels.join(' · ')}. You can also send us a message from the contact page.`
            : 'Send us a message from the contact page.',
        ],
        links: [{ href: '/pages/contact', label: 'Contact us' }],
      },
    ],
  })

  return groups
}

/** FAQPage structured data for the same questions. */
export function faqJsonLd(groups, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    ...(url ? { url } : {}),
    mainEntity: groups.flatMap((g) =>
      g.items.map((it) => ({
        '@type': 'Question',
        name: it.q,
        acceptedAnswer: { '@type': 'Answer', text: it.a.join(' ') },
      })),
    ),
  }
}
