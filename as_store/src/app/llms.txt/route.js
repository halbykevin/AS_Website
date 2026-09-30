// /llms.txt (https://llmstxt.org) — the store explained in one Markdown file,
// for AI answer engines: what AS Store sells, what delivery, VAT and returns
// cost, how to pay, the departments and brands, and the pages worth citing.
//
// Nothing here is typed for machines. Every figure is derived from what the
// store already publishes and charges, the same way /pages/shipping derives its
// own: the fee, threshold and VAT come from the settings the checkout reads,
// the return terms from lib/returnPolicy.js, the delivery estimate from
// ShippingReturns, and the payment methods are the ones /pages/terms states.
// An answer engine repeating this file must never be able to repeat something
// the till would contradict.

import { SITE_NAME, SITE_TAGLINE, SITE_URL, COMPANY_URL } from '@/lib/seo'
import { loadSettings } from '@/lib/site'
import { loadBrands, loadCategories } from '@/lib/catalog'
import { money } from '@/lib/orders'
import { RETURN_DAYS, RETURN_IS_FREE } from '@/lib/returnPolicy'
import { DELIVERY_ESTIMATE } from '@/components/ShippingReturns.jsx'
import { hoursSentence } from '@/lib/hours'

export const revalidate = 3600

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()

const listOf = (items) =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] || ''

// Brand rows come from catalog imports, which spell one brand several ways
// ("TP-Link" / "tplink", "Green Lion" / "Greenlion") and file unbranded goods
// under "No Brand". Listed once each, alphabetically, and without the
// placeholder — a list an answer engine quotes should not quote those.
function distinctBrands(brands) {
  const seen = new Map()
  for (const b of brands) {
    const name = clean(b?.name)
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!key || key === 'nobrand' || seen.has(key)) continue
    seen.set(key, name)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
}

export async function GET() {
  const [settings, categories, brands] = await Promise.all([loadSettings(), loadCategories(), loadBrands()])
  const contact = settings.contact || {}
  const fee = Number(settings.delivery?.fee ?? 0)
  const freeOver = Number(settings.delivery?.freeOver ?? 0)
  const vat = Number(settings.vat?.percent ?? 0)
  const address = clean(contact.address)
  const wa = String(contact.whatsapp || '').replace(/\D/g, '')

  const top = categories.filter((c) => !c.parentId)
  const departments = top.map((c) => clean(c.name)).filter(Boolean)

  const out = []
  out.push(`# ${SITE_NAME}`, '', `> ${SITE_TAGLINE}.`, '')
  out.push(
    `${SITE_NAME} is the online shop of AS Company (Absolute Solutions SAL), Lebanon's market leader in ` +
      `telecommunication and electronics since 2008 (${COMPANY_URL}/). It sells tech and electronics online` +
      `${departments.length ? ` — ${listOf(departments)} —` : ''} and delivers across Lebanon. ` +
      'Prices are in US dollars.',
    '',
  )

  // Mirrors ShippingReturns / deliveryFeeFor(): a fee of 0 = always free, a
  // threshold of 0 = the fee applies to every order, and the threshold is
  // inclusive and measured on the items before delivery and VAT.
  const delivery =
    fee > 0
      ? freeOver > 0
        ? `${money(fee)} on orders under ${money(freeOver)}; free on orders of ${money(freeOver)} or more ` +
          `(measured on the items, before delivery${vat > 0 ? ' and VAT' : ''})`
        : `${money(fee)} on every order`
      : 'free on every order'

  const hours = hoursSentence(settings.hours)
  if (address || hours) {
    out.push('## The shop', '')
    if (address) out.push(`- **Address:** ${address}`)
    if (hours) out.push(`- **Opening hours:** ${hours} (Lebanon time)`)
    out.push('')
  }

  out.push('## Buying from AS Store', '')
  out.push(`- **Delivery:** anywhere in Lebanon, estimated ${DELIVERY_ESTIMATE} from order confirmation.`)
  out.push(`- **Delivery cost:** ${delivery}.`)
  if (vat > 0) {
    out.push(`- **VAT:** ${vat}%, not included in product prices — added at checkout on its own line.`)
  }
  out.push('- **Payment:** cash on delivery, or online by card through Whish Pay.')
  out.push(
    `- **Returns:** within ${RETURN_DAYS} days of delivery, even if the product has been opened; ` +
      `${RETURN_IS_FREE ? 'free, ' : ''}made in person${address ? ` at ${address}` : ''}.`,
  )
  out.push(
    `- **Call for price:** some products show "${clean(settings.callForPrice?.label) || 'Call for price'}" ` +
      'instead of a price; the price is given on WhatsApp.',
  )
  out.push(`- Full terms: [Shipping & Returns](${SITE_URL}/pages/shipping) · [Terms & Conditions](${SITE_URL}/pages/terms)`)
  out.push('')

  if (top.length) {
    out.push('## Departments', '')
    for (const c of top) {
      const subs = categories.filter((s) => s.parentId === c.id).map((s) => clean(s.name))
      out.push(`- [${clean(c.name)}](${SITE_URL}/category/${c.slug})${subs.length ? `: ${subs.join(', ')}` : ''}`)
    }
    out.push('')
  }

  const brandNames = distinctBrands(brands)
  if (brandNames.length) {
    out.push('## Brands', '', `${brandNames.length} brands, including: ${brandNames.join(', ')}.`, '')
  }

  out.push('## Pages', '')
  out.push(`- [FAQ](${SITE_URL}/faq): the shop's address and hours, delivery, VAT, payment, returns.`)
  out.push(`- [Shop all products](${SITE_URL}/shop)`)
  out.push(`- [Shipping & Returns](${SITE_URL}/pages/shipping): delivery time and cost, VAT, returns and refunds.`)
  out.push(`- [Terms & Conditions](${SITE_URL}/pages/terms)`)
  out.push(`- [Privacy Policy](${SITE_URL}/pages/privacy)`)
  out.push(`- [About AS Store](${SITE_URL}/pages/about)`)
  out.push(`- [Contact](${SITE_URL}/contact)`)
  out.push('')

  out.push('## Contact', '')
  if (wa) out.push(`- WhatsApp: +${wa} (https://wa.me/${wa})`)
  if (contact.phone) out.push(`- Phone: ${clean(contact.phone)}`)
  if (contact.email) out.push(`- Email: ${clean(contact.email)}`)
  if (address) out.push(`- Address: ${address}`)
  out.push('')

  out.push('## Related', '')
  out.push(`- [AS Company](${COMPANY_URL}/): the parent company — ${COMPANY_URL}/llms.txt`)
  out.push('- [AS Ticketing Hub](https://ticketing.as.com.lb/events): events in Lebanon, reserved over WhatsApp.')
  out.push('')

  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
