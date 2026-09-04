import HomeRow from '@/components/home/HomeRow.jsx'
import { loadCategories, loadRowProducts } from '@/lib/catalog'
import { loadSettings } from '@/lib/site'

// How many categories get a row when the admin hasn't picked any yet. A fresh
// install still shows a real homepage; ticking "Show on homepage" on even one
// category takes over completely.
const FALLBACK_ROWS = 6

// Products asked of the API per row. More than we show, because a row only
// renders products that have a photo — a card with no image is worse than a
// shorter row.
const OVERFETCH = 3

// Homepage: the products themselves, one rail per category, under a small
// title. Nothing else — no hero, no marketing acts, no scroll choreography;
// the chrome is the nav and the footer.
//
// Which categories appear (and in what order) is the admin's: the "Show on
// homepage" flag in /admin/categories, ordered by each category's Sort. How
// many products a row holds, and the optional first row, come from
// /admin/settings → Homepage.
export default async function HomePage() {
  const [categories, settings] = await Promise.all([loadCategories(), loadSettings()])

  const homeNew = settings?.homeNew || {}
  const perRow = Math.min(24, Math.max(2, Number(homeNew.count) || 8))
  const ask = { limit: perRow * OVERFETCH }

  // Row 0 — the admin's own row (newest / featured / one category). Optional.
  const chosenCat =
    homeNew.source === 'category' && homeNew.categoryId
      ? categories.find((c) => String(c.id) === String(homeNew.categoryId))
      : null
  const leadQuery =
    homeNew.source === 'featured'
      ? { ...ask, featured: true }
      : chosenCat
        ? { ...ask, category: chosenCat.slug }
        : { ...ask, sort: 'newest' }

  // The category rows. Falls back to the first few categories until someone
  // ticks the flag, so the homepage is never blank.
  const picked = categories.filter((c) => c.showOnHome)
  const rowCats = (picked.length ? picked : categories.slice(0, FALLBACK_ROWS)).slice(0, 12)

  const [lead, ...rowProducts] = await Promise.all([
    homeNew.enabled === false ? Promise.resolve([]) : loadRowProducts(leadQuery),
    ...rowCats.map((c) => loadRowProducts({ ...ask, category: c.slug })),
  ])

  // A card with no photo is a hole in the rail — drop those, then cut to size.
  const shown = (list) => list.filter((p) => p.image).slice(0, perRow)

  const leadHref =
    homeNew.source === 'featured'
      ? '/shop'
      : chosenCat
        ? `/category/${chosenCat.slug}`
        : '/shop?sort=newest'

  return (
    // The top padding lives here, not on the first row: it clears the fixed nav,
    // and a row can render nothing (an empty category), which would hand that job
    // to whichever row happened to be first.
    <div className="bg-white pb-16 pt-[4.5rem] sm:pb-24 sm:pt-20">
      {/* The page is all product rails, whose titles are h2s — so the one
          heading that says what this page IS lives here, for search engines and
          screen readers rather than for the layout. */}
      <h1 className="sr-only">AS Store — tech &amp; electronics in Lebanon</h1>
      <HomeRow
        title={homeNew.heading || 'New in'}
        href={leadHref}
        products={shown(lead)}
      />
      {rowCats.map((c, i) => (
        <HomeRow
          key={c.id}
          title={c.name}
          href={`/category/${c.slug}`}
          products={shown(rowProducts[i])}
        />
      ))}
    </div>
  )
}
