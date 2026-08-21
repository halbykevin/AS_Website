import { loadProductsWithGallery, loadCategories } from '@/lib/catalog'
import { buildMerchantFeed } from '@/lib/merchantFeed'
import { SITE_NAME, SITE_URL } from '@/lib/seo'

// The Google Merchant Center product feed, served at
// https://store.as.com.lb/google-merchant.xml
//
// Why here and not on the Express API: the feed's job is to describe the pages
// on THIS origin. Every g:link points at store.as.com.lb, and Merchant Center
// wants the feed and its landing pages under a domain the account has claimed.
// Serving it from store-api.as.com.lb would work but would put the feed on a
// host that owns none of the pages it advertises. Living here also means it
// reuses the storefront's own cached loaders, so the feed can never describe a
// different catalogue from the product pages it links to.
//
// Public and unauthenticated by design — Googlebot fetches it with no
// credentials. It exposes strictly what the anonymous /api/products already
// serves: nothing admin-only, no cost prices (there is no such column), and no
// price at all for "call for price" products, whose price the API strips before
// this code ever sees it.

// Cached exactly like the sitemap next door: regenerated at most hourly, and
// purged the moment an admin saves (/api/revalidate calls revalidatePath on
// this route by name, because a route handler is not reached by the layout
// sweep). So a price edit lands in the feed as fast as it lands on the product
// page.
//
// This has to be cached, and the reason is worth recording. The route was
// briefly `force-dynamic` — to guarantee the empty-catalogue guard below always
// ran fresh — and that quietly opted every fetch inside it out of the data
// cache as well. The result in production: 5.7 MB re-fetched from the API and
// re-serialised on EVERY request, 21 s a time, with Vercel refusing to
// CDN-cache a dynamic response (`Cache-Control: public, max-age=0`). Google
// would have been made to wait 21 s for each fetch. Serving the whole catalogue
// is a ~32 s query upstream; it must happen once an hour, not once a request.
//
// `force-static` is required, not decorative: Next 15 treats a route handler as
// dynamic by default, so `revalidate` on its own changes nothing (the build
// still marks it ƒ, and Vercel still refuses to CDN-cache it). With both, this
// route is prerendered and served from the edge exactly like /sitemap.xml —
// measured there as an `X-Vercel-Cache: HIT` in ~1.3 s.
export const dynamic = 'force-static'
export const revalidate = 3600

export async function GET() {
  const [products, categories] = await Promise.all([loadProductsWithGallery(), loadCategories()])

  // An empty catalogue is never a legitimate answer here — the store has ~1,700
  // products — so it means the API is down and the loader returned its []
  // fallback. Answer 503 and let Google keep the last good copy: submitting an
  // empty feed would delist every offer in the account.
  //
  // Caching does not put this guard at risk, which was the original worry.
  // Verified by building with the API stopped: Next refuses to prerender a
  // non-200 response, so the route silently falls back to dynamic (`ƒ`) for
  // that build instead of freezing a 503 at the edge — and it starts returning
  // the real feed again the moment the API answers. A build during an outage
  // therefore costs performance, never correctness.
  if (!Array.isArray(products) || products.length === 0) {
    return new Response('Product catalogue unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  // Flat list -> id lookup, so g:product_type can be the full
  // department > category trail rather than just the leaf.
  const byId = new Map(
    (Array.isArray(categories) ? categories : []).map((c) => [
      c.id,
      { id: c.id, name: c.name, parentId: c.parentId ?? null },
    ]),
  )

  const { xml } = buildMerchantFeed(products, byId, {
    title: `${SITE_NAME} — product feed`,
    link: SITE_URL,
    description: `Products available to order from ${SITE_NAME}, delivered across Lebanon.`,
  })

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Vercel's ISR layer owns Cache-Control on a cached route, so this is not
      // where the CDN behaviour comes from — `revalidate` above is. Stated
      // anyway for anyone serving this from somewhere other than Vercel.
      'CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
