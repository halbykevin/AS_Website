// "Call for price" — products the store doesn't advertise a price on (Apple
// hardware, mostly), where the price is replaced by a WhatsApp enquiry.
//
// The flag rides on the product (`callForPrice`); the wording and destination
// come from store settings, so the copy is written once in the CMS for the web
// and the app together. The API strips `price` from these products in every
// public response, so `product.price` is null here — there is nothing for the
// app to leak even by accident, and nothing to add to a bag: the server refuses
// to sell them, so the app must not offer to.

import { STORE_WEB_URL } from '@/src/config/env';
import { whatsappChatUrl } from './whatsapp';

const FALLBACK = {
  label: 'Call for price',
  button: 'Ask for a price',
  note: '',
  message: "Hi, I'd like a price for {product} — {url}",
  url: '',
};

// True when this product's price must not be shown or sold. Reads the flag, not
// the absent price: a product whose price merely failed to load is a different
// problem and must not silently turn into an enquiry.
export const isCallForPrice = product => Boolean(product?.callForPrice);

// The copy, merged over the defaults so a store that has never opened the
// setting still reads sensibly.
export const callForPriceCopy = settings => ({ ...FALLBACK, ...(settings?.callForPrice || {}) });

/**
 * Where the enquiry button goes, or '' when there is nowhere to send them (no
 * WhatsApp number and no override URL in the CMS) — callers fall back to plain
 * text rather than open nothing.
 *
 * A URL in settings wins over WhatsApp: it is the deliberate escape hatch for
 * pointing at a form or a contact page instead.
 */
export function enquiryUrl(product, settings) {
  const copy = callForPriceCopy(settings);
  if (copy.url) return copy.url;

  const number = settings?.contact?.whatsapp;
  if (!number) return '';

  const productUrl = product?.slug ? `${STORE_WEB_URL}/product/${product.slug}` : STORE_WEB_URL;
  const text = (copy.message || FALLBACK.message)
    .replaceAll('{product}', product?.name || 'this product')
    .replaceAll('{url}', productUrl);
  return whatsappChatUrl(number, text);
}
