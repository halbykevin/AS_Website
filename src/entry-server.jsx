// The build-time renderer. `vite build --ssr` bundles this for Node, and
// scripts/prerender.mjs imports it to turn each public route into static HTML.
// It is never shipped to the browser.
import { Writable } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { ContentProvider } from './store/content.jsx'
import { AppRoutes } from './App.jsx'

export { loadSite, defaultContent, API_URL } from './lib/api.js'
export { routeHead, renderHeadTags, prerenderRoutes, jsonLdString, SITE_URL } from './lib/seo.js'
export { sitemapXml, llmsTxt, robotsTxt } from './lib/seoFiles.js'

/**
 * The content a page is built with, and ships to the browser as
 * window.__AS_DATA__. Events are left out: at ~120 KB they would be most of
 * every page's weight, and no pre-rendered route shows them — /events 301s to
 * the ticketing hub before it ever reaches this site. The client's refresh
 * brings them in for anything that still wants them. The same goes for the
 * two fields only the events pages read: `banners` (retained, no longer
 * rendered) and the event `categories`.
 */
export function snapshotOf(data) {
  return { content: { ...data.content, banners: [], categories: [] }, events: [] }
}

/**
 * Renders one route to an HTML string. Waits for every lazy page and Suspense
 * boundary (onAllReady) so the output is the whole page, not a skeleton, and
 * rejects on any render error — a page that failed to render must fail the
 * build rather than ship half-empty.
 */
export function render(url, data) {
  return new Promise((resolve, reject) => {
    let html = ''
    let failure = null
    const sink = new Writable({
      write(chunk, _encoding, done) {
        html += chunk.toString()
        done()
      },
    })
    sink.on('finish', () => (failure ? reject(failure) : resolve(html)))

    const { pipe, abort } = renderToPipeableStream(
      <ContentProvider initialData={data}>
        <StaticRouter location={url}>
          <AppRoutes />
        </StaticRouter>
      </ContentProvider>,
      {
        onAllReady() {
          pipe(sink)
        },
        onShellError(error) {
          reject(error)
        },
        onError(error) {
          failure = failure || error
        },
      },
    )
    setTimeout(() => abort(new Error(`Timed out rendering ${url}`)), 20000).unref()
  })
}
