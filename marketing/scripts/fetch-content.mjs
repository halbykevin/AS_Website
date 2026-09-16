// Snapshot everything the reel puts on screen: real products (photo + price +
// brand), real events, and the real prize wheel.
//
// The reel shows the actual catalogue, not stock imagery — a viewer who taps
// through has to find the same products at the same prices, the same events on
// the same nights, and the same slices on the wheel. That is also why the
// snapshot is *committed*: a render must not depend on the APIs being up, and a
// video that shipped to Instagram should stay reproducible after the nightly
// catalog sync has moved on.
//
//   npm run content            # refresh from the live APIs
//   npm run content -- --store http://localhost:8081 --site http://localhost:8080
//
// Read the diff before committing: a price, a date, and the odds-bearing labels
// on the wheel are all promises the business then has to keep.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src', 'data');
const OUT_IMAGES = join(ROOT, 'public', 'products');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const trim = url => url.replace(/\/+$/, '');
const STORE_API = trim(flag('store', 'https://store-api.as.com.lb'));
const SITE_API = trim(flag('site', 'https://asapi.as.com.lb'));

// What the Shop scene scrolls through. Category slugs, in the order they should
// appear — a mix of departments so the grid reads as a whole store rather than
// one shelf. `take` is how many survive the filtering below.
const PICKS = [
  { category: 'laptops', take: 5 },
  { category: 'wearable', take: 4 },
  { category: 'speakers', take: 4 },
  { category: 'headsets-and-microphones', take: 4 },
  { category: 'gaming', take: 4 },
  { category: 'phones-tablets', take: 3 }
];

// Brands a viewer recognises in half a second, which is all a scrolling grid
// gets. Not a quality judgement — purely "does this read at 200px while moving".
const KNOWN = [
  'apple', 'samsung', 'sony', 'jbl', 'bose', 'hp', 'lenovo', 'dell', 'asus', 'msi',
  'logitech', 'xiaomi', 'nintendo', 'anker', 'belkin', 'canon', 'nikon', 'lg',
  'razer', 'jabra', 'marshall', 'beats', 'whoop', 'garmin', 'microsoft', 'acer'
];

// The catalog stores brands title-cased ("Hp", "Jbl"), which is right in a CMS
// field and wrong on a card in an advert. Only the acronyms need saying.
const BRAND_CASE = {
  hp: 'HP',
  jbl: 'JBL',
  lg: 'LG',
  msi: 'MSI',
  rca: 'RCA',
  vtech: 'VTech',
  greenlion: 'Green Lion'
};

const clean = str =>
  String(str || '')
    .replace(/\s+/g, ' ')
    // The catalog carries en/em dashes and non-breaking hyphens from the source
    // shop; they render as tofu in some font stacks, so flatten them here once.
    .replace(/[‐-―−]/g, '-')
    .replace(/[  ]/g, ' ')
    .trim();

const prettyBrand = str => {
  const b = clean(str);
  return BRAND_CASE[b.toLowerCase().replace(/\s+/g, '')] || b;
};

// A grid cell is ~2 lines. Cut on a word, never mid-word, and never mid-spec.
const shorten = (name, max = 46) => {
  const n = clean(name).split(/\s+[-|]\s+/)[0];
  if (n.length <= max) return n;
  const cut = n.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trim()}...`;
};

const score = p => {
  const brand = clean(p.brand).toLowerCase();
  const known = KNOWN.findIndex(b => brand.includes(b) || clean(p.name).toLowerCase().startsWith(b));
  return (known >= 0 ? 100 - known : 0) + (p.featured ? 20 : 0) + Math.min(Number(p.price) || 0, 60) / 10;
};

const getJson = async (base, path) => {
  const res = await fetch(`${base}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
};

const writeData = (file, payload) =>
  writeFile(
    join(DATA, file),
    JSON.stringify({ fetchedAt: new Date().toISOString().slice(0, 10), ...payload }, null, 2) + '\n'
  );

const slugify = str =>
  clean(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${url} -> HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

// --- products --------------------------------------------------------------

async function fetchProducts() {
  await mkdir(OUT_IMAGES, { recursive: true });
  const chosen = [];
  const seen = new Set();

  for (const { category, take } of PICKS) {
    let rows = [];
    try {
      rows = await getJson(STORE_API, `/api/products?category=${encodeURIComponent(category)}&limit=40`);
    } catch (err) {
      console.warn(`  ! ${category}: ${err.message}`);
      continue;
    }

    const usable = rows
      // No price means "call for price" — a reel that flashes a blank price tag
      // looks broken, and that flag exists precisely so we don't quote a number.
      .filter(p => p.image && !p.callForPrice && Number(p.price) > 0)
      .filter(p => {
        const key = shorten(p.name).toLowerCase();
        if (seen.has(key)) return false; // the catalog carries near-duplicate rows
        seen.add(key);
        return true;
      })
      .sort((a, b) => score(b) - score(a))
      .slice(0, take);

    console.log(`  ${category}: ${usable.length}/${rows.length}`);
    chosen.push(...usable);
  }

  if (!chosen.length) throw new Error(`no products came back from ${STORE_API} — is it reachable?`);

  const products = [];
  for (const p of chosen) {
    const file = `${slugify(p.brand || p.name)}-${p.id}.webp`;
    try {
      await download(p.image, join(OUT_IMAGES, file));
    } catch (err) {
      console.warn(`  ! image for ${p.id}: ${err.message}`);
      continue;
    }
    products.push({
      id: p.id,
      name: shorten(p.name),
      fullName: clean(p.name),
      brand: prettyBrand(p.brand) || clean(p.name).split(' ')[0],
      price: Number(p.price),
      oldPrice: Number(p.oldPrice) || null,
      category: clean(p.category),
      image: `products/${file}`
    });
  }

  // `total` is the headline claim in the Shop scene, so it is measured, never
  // guessed — and the scene rounds it *down* before it says it out loud.
  let total = products.length;
  try {
    total = (await getJson(STORE_API, '/api/products?limit=5000')).length || total;
  } catch (err) {
    console.warn(`  ! catalogue count: ${err.message}`);
  }

  await writeData('products.json', { api: STORE_API, total, products });
  console.log(`  -> ${products.length} products (catalogue: ${total})`);
}

// --- events ----------------------------------------------------------------

async function fetchEvents() {
  const rows = await getJson(SITE_API, '/api/events');
  const today = new Date().toISOString().slice(0, 10);

  const events = rows
    .filter(e => e.title && e.date && e.date >= today && e.venue)
    .slice(0, 8)
    .map(e => ({
      title: clean(e.title),
      // The poster artwork is the promoter's, not ours, so only the facts are
      // taken and the reel draws its own card. See the Events scene.
      date: e.date,
      time: clean(e.time),
      venue: clean(e.venue),
      city: clean(e.city),
      category: clean(e.categoryName) || 'Events'
    }));

  if (!events.length) throw new Error('no upcoming events came back');
  await writeData('events.json', { api: SITE_API, total: rows.length, events });
  console.log(`  -> ${events.length} events (${rows.length} live)`);
}

// --- the prize wheel -------------------------------------------------------

async function fetchSpin() {
  const spin = await getJson(STORE_API, '/api/spin');
  const slices = (spin.slices || []).map(s => ({
    label: clean(s.label),
    type: s.type,
    color: s.color || '#A41E22'
  }));
  if (!slices.length) throw new Error('the wheel came back with no slices');

  await writeData('spin.json', {
    api: STORE_API,
    title: clean(spin.title) || 'Daily Spin',
    subtitle: clean(spin.subtitle),
    cooldownHours: spin.cooldownHours ?? 24,
    slices
  });
  console.log(`  -> ${slices.length} wheel slices`);
}

async function main() {
  await mkdir(DATA, { recursive: true });
  const steps = [
    ['products', fetchProducts],
    ['events', fetchEvents],
    ['wheel', fetchSpin]
  ];
  // One unreachable API should not cost the snapshot of the other two — the
  // committed copy of whatever failed stays valid until the next run.
  let failed = 0;
  for (const [name, run] of steps) {
    console.log(`${name}:`);
    try {
      await run();
    } catch (err) {
      failed += 1;
      console.warn(`  ! ${name} skipped — ${err.message}`);
    }
  }
  console.log(failed ? `\ndone, ${failed} of ${steps.length} skipped` : '\ndone — src/data/ refreshed');
  process.exitCode = failed === steps.length ? 1 : 0;
}

main().catch(err => {
  console.error(`\nfetch-content failed: ${err.message}`);
  process.exit(1);
});
