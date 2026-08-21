import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'

// On-demand cache purge for the storefront. The admin CMS calls this after any
// content save (see lib/adminApi.js) so edits appear immediately despite the
// SSR data cache. It's authorized by verifying the caller's admin Bearer token
// against the API's /api/auth/me — no shared secret ever touches the browser.
//
// Two purges, because one is not enough:
//   • revalidateTag('store')        drops the cached API responses (the data).
//   • revalidatePath('/', 'layout') drops the rendered pages built from them.
// Routes with no dynamic input — the homepage above all — are prerendered as
// fully static and the CDN then serves that HTML indefinitely, so purging only
// the data cache left visitors on a build-time copy of the site (observed:
// a homepage 6.5 hours stale, still advertising a popup that had been turned
// off). 'layout' makes it recursive: every page under the root layout.

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

export async function POST(req) {
  const auth = req.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  // Prove the caller is a signed-in admin before letting them bust the cache.
  try {
    const me = await fetch(`${API}/api/auth/me`, { headers: { Authorization: auth }, cache: 'no-store' })
    if (!me.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  } catch {
    return NextResponse.json({ error: 'verify failed' }, { status: 502 })
  }
  revalidateTag('store')
  revalidatePath('/', 'layout')
  // The Merchant feed and the sitemap are route handlers, not pages, so the
  // 'layout' sweep above does not reach them. Google reads a stale price as a
  // mismatch against the product page, so purge them by name.
  revalidatePath('/google-merchant.xml')
  revalidatePath('/sitemap.xml')
  return NextResponse.json({
    revalidated: true,
    scope: ['tag:store', 'path:/ (layout)', 'path:/google-merchant.xml', 'path:/sitemap.xml'],
    now: Date.now(),
  })
}
