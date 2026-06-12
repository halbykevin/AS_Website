// ---------------------------------------------------------------------------
// Site configuration
//
// These values will eventually be served by the admin backend (on the VPS).
// For now they live here as the single source of truth for the frontend.
//
// `published` controls the publish gate:
//   - false -> visitors see the "Coming Soon" page
//   - true  -> visitors see the full website
//
// While building, you can always view the full site (even when unpublished)
// by adding ?preview=1 to the URL, e.g. http://localhost:5173/?preview=1
// ---------------------------------------------------------------------------

// Whether the full site is publicly visible is now controlled by the
// `published` flag on the settings record in PocketBase (editable from the
// admin dashboard). This static flag is only a fallback used when the backend
// is unreachable.
export const siteConfig = {
  fallbackPublished: false,
}

// While building, append ?preview=1 to view the full site even when unpublished.
export function isPreview() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('preview')
}
