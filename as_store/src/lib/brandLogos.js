// Brand logos for the About page. Our brands come from scraping (names only, no
// uploaded logo images), so for the well-known ones we render a crisp logo from
// the free, no-auth Simple Icons CDN (brand-coloured SVG, hotlink-friendly).
// Anything not in this set falls back to a styled name chip in the UI.

// normalize("TP-Link") -> "tplink", normalize("Western Digital") -> "westerndigital"
export const normalizeBrand = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')

// Simple Icons slugs known to still resolve on the CDN (it has purged many
// brand logos). Limited to consumer-electronics brands a store like this carries.
// A slug that later 404s just triggers the name-chip fallback via the <img>
// onError handler, so this stays safe — but we keep confirmed-404 brands OUT so
// the logo marquee doesn't flash broken images (they still show in the name cloud).
export const LOGO_SLUGS = new Set([
  // verified serving as of build
  'apple', 'samsung', 'sony', 'huawei', 'xiaomi', 'asus', 'acer', 'lenovo',
  'dell', 'hp', 'intel', 'nvidia', 'jbl', 'bose', 'razer', 'corsair', 'msi',
  'tplink', 'seagate', 'meta', 'google', 'ubiquiti', 'epson', 'sennheiser',
  'panasonic', 'vivo',
  // likely-present majors (fall back to a name chip if the CDN misses)
  'lg', 'amd', 'nikon', 'honor', 'oneplus', 'oppo', 'nokia', 'motorola', 'zte',
  'tcl', 'realtek', 'brother', 'netgear', 'toshiba', 'hikvision', 'sharp',
  'hisense', 'aoc', 'benq', 'tenda', 'steelseries', 'nzxt', 'redragon',
])

// Returns the Simple Icons slug for a brand name if we have a logo for it, else null.
export function brandLogoSlug(name) {
  const slug = normalizeBrand(name)
  return LOGO_SLUGS.has(slug) ? slug : null
}

// Brand-coloured logo URL from the Simple Icons CDN.
export const logoUrl = (slug) => `https://cdn.simpleicons.org/${slug}`
