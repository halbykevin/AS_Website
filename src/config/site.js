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

export const siteConfig = {
  published: false,
}

// Returns true when the full site should be shown.
export function isSiteVisible() {
  if (siteConfig.published) return true
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('preview')
}
