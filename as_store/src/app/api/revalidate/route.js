import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

// On-demand cache purge for the storefront. The admin CMS calls this after any
// content save (see lib/adminApi.js) so edits appear immediately despite the
// SSR data cache. It's authorized by verifying the caller's admin Bearer token
// against the API's /api/auth/me — no shared secret ever touches the browser.

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
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
