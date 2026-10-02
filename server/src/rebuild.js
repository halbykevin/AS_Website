// ---------------------------------------------------------------------------
// Keeps the pre-rendered marketing site in step with its content.
//
// as.com.lb's public pages are static HTML, rendered at build time from this
// API (scripts/prerender.mjs at the repo root) so that crawlers — AI answer
// engines included, which do not run JavaScript — read the real page. Visitors
// always see current content either way (each page refreshes itself from this
// API as it loads); what goes stale between builds is what a crawler reads.
//
// So when an admin saves something those pages carry, this asks Vercel for a
// fresh build through a Deploy Hook. Debounced: saving ten fields in a row is
// one build, not ten.
//
//   SITE_REBUILD_HOOK_URL       the Deploy Hook (Vercel → the marketing-site
//                               project → Settings → Git → Deploy Hooks).
//                               Unset = all of this is off.
//   SITE_REBUILD_DELAY_SECONDS  quiet period after the last change (default 120)
//   SITE_REBUILD_EVERY_HOURS    also rebuild on a timer (default 24, 0 = off):
//                               the homepage's store slideshow comes from the
//                               AS Store's live catalog, which changes without
//                               anyone touching this admin.
// ---------------------------------------------------------------------------

const HOOK = (process.env.SITE_REBUILD_HOOK_URL || '').trim()
const DELAY_MS = Math.max(0, Number(process.env.SITE_REBUILD_DELAY_SECONDS ?? 120)) * 1000
const EVERY_HOURS = Number(process.env.SITE_REBUILD_EVERY_HOURS ?? 24)

// Admin writes whose content ends up in the pre-rendered HTML. Events and
// event categories are absent on purpose: /events lives on the ticketing hub,
// which renders on demand and needs no rebuild.
const CONTENT_ROUTES =
  /^\/api\/(settings|services|what-we-do|solutions|store-banner|popup|predictor|predictor-matches|sections)(\/|$)/

let timer = null
const reasons = new Set()

export const rebuildEnabled = () => Boolean(HOOK)

/** Express middleware: a successful admin write to page content schedules a rebuild. */
export function rebuildOnContentChange(req, res, next) {
  if (!HOOK || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  if (!CONTENT_ROUTES.test(req.path)) return next()
  // Judged on the response, so a rejected (401) or failed write builds nothing.
  res.on('finish', () => {
    if (res.statusCode < 400) scheduleRebuild(`${req.method} ${req.path}`)
  })
  next()
}

export function scheduleRebuild(reason) {
  if (!HOOK) return
  reasons.add(reason)
  clearTimeout(timer)
  timer = setTimeout(fire, DELAY_MS)
}

async function fire() {
  const why = [...reasons].join(', ')
  reasons.clear()
  try {
    const r = await fetch(HOOK, { method: 'POST', signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    console.log(`[rebuild] site rebuild requested (${why})`)
  } catch (err) {
    console.warn(`[rebuild] the deploy hook failed (${why}): ${err.message}`)
  }
}

/** The periodic rebuild; call once at startup. */
export function startRebuildSchedule() {
  if (!HOOK || !(EVERY_HOURS > 0)) return
  setInterval(() => scheduleRebuild('scheduled'), EVERY_HOURS * 3600 * 1000).unref()
}
