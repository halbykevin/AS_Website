import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import App from './App.jsx'
import { isPreview } from './config/site.js'
import { normalizePath } from './lib/seo.js'
import './index.css'

// The public pages arrive pre-rendered (scripts/prerender.mjs): real HTML plus
// the content it was built from in window.__AS_DATA__ and the route it was
// built for in window.__AS_PATH__. Those pages are hydrated — React adopts the
// HTML already on screen instead of replacing it with a skeleton.
//
// Everything else is served the plain shell (dist/spa.html) and rendered from
// scratch, as before: the admin, unknown URLs, and one edge case — ?preview=1
// on an unpublished site, whose HTML is Coming Soon while the preview renders
// the full site, so there is nothing to adopt.
const container = document.getElementById('root')
const data = window.__AS_DATA__ || null
const builtFor = window.__AS_PATH__ || ''

const app = (
  <React.StrictMode>
    <App initialData={data} />
  </React.StrictMode>
)

const canHydrate =
  data &&
  builtFor === normalizePath(window.location.pathname) &&
  !(isPreview() && !data.content?.published)

if (canHydrate) {
  hydrateRoot(container, app)
} else {
  createRoot(container).render(app)
}
