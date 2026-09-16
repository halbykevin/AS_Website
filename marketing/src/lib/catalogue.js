// The snapshot, and the few questions the scenes ask of it.
//
// Everything here reads `src/data/*.json`, written by `npm run content` from
// the live APIs. Scenes never fetch: a render has to produce the same frames
// twice, and a video that shipped last week should still rebuild next month.

import productData from '../data/products.json';
import eventData from '../data/events.json';
import spinData from '../data/spin.json';

export const products = productData.products;
export const events = eventData.events;
export const wheel = spinData;

/**
 * The catalogue size, as the reel is allowed to say it.
 *
 * Rounded *down* to the nearest hundred and suffixed "+", so it stays true as
 * the nightly catalog sync adds and delists rows. An exact count would be a
 * claim that expires the same night — and the guard is on the low side because
 * the honest failure is understating the shop, never overstating it.
 */
export const catalogueClaim = () => `${Math.floor(productData.total / 100) * 100}+`;

/**
 * A named product, by brand or by a word in its name.
 *
 * Scenes ask for products this way rather than by index, so re-running
 * `npm run content` reorders the snapshot without silently swapping the hero
 * product in the add-to-bag beat. Falls back to the first row, so a product
 * that leaves the catalogue costs a scene its ideal subject and not its render.
 */
export const pick = (...terms) => {
  for (const term of terms) {
    const needle = term.toLowerCase();
    const hit = products.find(
      p => p.brand.toLowerCase() === needle || p.name.toLowerCase().includes(needle)
    );
    if (hit) return hit;
  }
  return products[0];
};

/** `pick`, but for however many distinct products a grid needs. */
export const take = (count, from = 0) => {
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(products[(from + i) % products.length]);
  return out;
};

/** "Thu 18 Sep" — the app's own short form for an event date. */
export const shortDate = iso => {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};
