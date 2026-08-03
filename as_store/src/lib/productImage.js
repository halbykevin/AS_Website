// What to show for a product that has no photo of its own.
//
// Source shops put their own logo on products they have no picture for; the
// importer strips those (server/src/scraper.js → isPlaceholderImage), because a
// competitor's logo has no business on an AS Store product page. That leaves a
// handful of products with an empty image, and `next/image` THROWS on an empty
// src — so without this the shop and category pages would fail to render, not
// merely look bare. Falls back to the AS mark.

export const PRODUCT_IMAGE_FALLBACK = '/as-store-logo.webp'

export const productImage = (src) => {
  const s = typeof src === 'string' ? src.trim() : ''
  return s || PRODUCT_IMAGE_FALLBACK
}
