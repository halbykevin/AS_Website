'use client'

// "Call for price" — products we don't advertise a price on (Apple hardware,
// mostly), where the price is replaced by a WhatsApp enquiry.
//
// The flag lives on the product (`callForPrice`); the wording and the
// destination live in Settings, so the copy is written once for the whole
// catalogue. The API strips `price` from these products in every public
// response, so `product.price` is null out here — there is nothing for the
// storefront to leak even by accident.
//
// The copy reaches product tiles through a context rather than props: tiles are
// rendered from a dozen places (shop, category, search, rails, the homepage)
// and threading settings through all of them would mean every future grid has
// to remember to. The provider is mounted once, in the storefront layout.

import { createContext, useContext } from 'react'
import { SITE_URL } from '@/lib/seo'

const FALLBACK = {
  label: 'Call for price',
  button: 'Ask for a price',
  note: '',
  message: "Hi, I'd like a price for {product} — {url}",
  url: '',
  whatsapp: '',
}

const CallForPriceContext = createContext(FALLBACK)

// NOTE: the matching `callForPriceConfig()` lives in lib/site.js, not here. It
// is called by the storefront *layout*, a server component — and importing a
// plain function from a 'use client' module into a server component hands back
// a client-reference proxy, not the function, which fails at render.

export function CallForPriceProvider({ config, children }) {
  return <CallForPriceContext.Provider value={config || FALLBACK}>{children}</CallForPriceContext.Provider>
}

export const useCallForPrice = () => useContext(CallForPriceContext)

// True when this product's price must not be shown or sold. Reads the flag, not
// the absent price: a product whose price merely failed to load is a different
// problem and must not silently turn into an enquiry.
export const isCallForPrice = (product) => Boolean(product?.callForPrice)

// Digits only — wa.me rejects "+961 70 123 456" but is happy with 96170123456.
const waNumber = (raw) => String(raw || '').replace(/\D/g, '')

/**
 * Where the enquiry button goes for one product, or '' when there is nowhere to
 * send them (no WhatsApp number and no override URL) — callers fall back to
 * plain text rather than render a dead button.
 *
 * A URL in Settings wins over WhatsApp: it is the deliberate escape hatch for
 * pointing at a form or a contact page instead.
 */
export function enquiryUrl(product, config) {
  const cfg = config || FALLBACK
  if (cfg.url) return cfg.url

  const number = waNumber(cfg.whatsapp)
  if (!number) return ''

  const productUrl = product?.slug ? `${SITE_URL}/product/${product.slug}` : SITE_URL
  const text = (cfg.message || FALLBACK.message)
    .replaceAll('{product}', product?.name || 'this product')
    .replaceAll('{url}', productUrl)
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}
