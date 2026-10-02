#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Pre-renders the public site into static HTML — the last step of
// `npm run build`, after the client build (dist/) and the server build of
// src/entry-server.jsx (dist-ssr/).
//
// Why: the site is a React SPA, and a crawler that does not run JavaScript —
// which is every AI/answer-engine crawler (GPTBot, ClaudeBot, PerplexityBot…)
// and the first pass of most others — used to receive an empty <div id="root">.
// Now every public route is a complete HTML page with its own title,
// description, canonical and JSON-LD, which the browser then hydrates.
//
// What it writes into dist/:
//   index.html, what-we-do.html, what-we-do/<slug>.html, contact.html
//       one per public route, served extensionless by vercel.json (cleanUrls)
//   spa.html      the plain shell, for everything not pre-rendered (the admin,
//                 unknown URLs) — vercel.json's fallback rewrite points here
//   sitemap.xml, robots.txt, llms.txt   generated from the same content
//
// The content comes from the live API (VITE_API_URL) at build time. If the API
// cannot be reached the build FAILS, on purpose: Vercel then keeps serving the
// previous deployment, pre-rendered pages and all, instead of silently
// replacing it with empty shells. Set PRERENDER_ALLOW_FALLBACK=1 to ship the
// plain SPA anyway (e.g. to deploy a fix while the API is down).
//
// Pages go stale only until the next build; the API triggers one when content
// changes (server/src/rebuild.js). Visitors never see stale content either way —
// the page refreshes itself from the API right after it loads.
// ---------------------------------------------------------------------------

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const SSR_ENTRY = path.join(ROOT, 'dist-ssr', 'entry-server.js')
const MANIFEST = path.join(DIST, '.vite', 'manifest.json')

const ssr = await import(pathToFileURL(SSR_ENTRY).href)
const { render, loadSite, defaultContent, routeHead, renderHeadTags, prerenderRoutes, snapshotOf, jsonLdString } = ssr
const { sitemapXml, llmsTxt, robotsTxt, SITE_URL, API_URL } = ssr

const template = await fs.readFile(path.join(DIST, 'index.html'), 'utf8')
const SEO_BLOCK = /<!--seo:start-->[\s\S]*?<!--seo:end-->/
const ROOT_DIV = '<div id="root"></div>'
if (!SEO_BLOCK.test(template) || !template.includes(ROOT_DIV)) {
  fail('dist/index.html is missing the <!--seo:start-->…<!--seo:end--> block or an empty <div id="root"></div>.')
}

// The untouched shell, for every URL that is not pre-rendered.
await write('spa.html', template)

const data = await loadWithRetry()
if (!data) {
  if (process.env.PRERENDER_ALLOW_FALLBACK === '1') {
    warn('The API could not be reached — shipping the plain SPA shell (PRERENDER_ALLOW_FALLBACK=1).')
    // Crawler files still go out, from the static defaults, so nothing 404s.
    const c = { ...defaultContent, published: true }
    await writeCrawlerFiles(c)
    await cleanup()
    process.exit(0)
  }
  fail(
    `Could not load site content from the API (${apiUrl()}), so there is nothing to pre-render.\n` +
      '  The previous deployment stays live. Fix the API (or VITE_API_URL) and redeploy, or set\n' +
      '  PRERENDER_ALLOW_FALLBACK=1 to ship the un-rendered SPA.',
  )
}

const snapshot = snapshotOf(data)
const content = snapshot.content
const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'))
const entryChunk = Object.values(manifest).find((m) => m.isEntry)

const routes = prerenderRoutes(content)
const report = []
for (const route of routes) {
  const appHtml = await render(route.path, snapshot)
  if (!appHtml.trim()) fail(`${route.path} rendered to an empty string.`)

  const head = renderHeadTags(routeHead(route.path, content), content)
  const state =
    `<script>window.__AS_DATA__=${jsonLdString(snapshot)};` +
    `window.__AS_PATH__=${JSON.stringify(route.path)}</script>`

  const html = template
    .replace(SEO_BLOCK, () => `<!--seo:start-->\n    ${head}\n    <!--seo:end-->`)
    .replace('</head>', () => `${preloadsFor(route.module)}  </head>`)
    .replace(ROOT_DIV, () => `<div id="root">${appHtml}</div>\n    ${state}`)

  const file = route.path === '/' ? 'index.html' : `${route.path.slice(1)}.html`
  await write(file, html)
  report.push([route.path, file, html.length, textLength(appHtml)])
}

await writeCrawlerFiles(content)
await cleanup()

console.log(`\nPre-rendered ${routes.length} page(s) for ${SITE_URL}:`)
for (const [route, file, bytes, text] of report) {
  console.log(`  ${route.padEnd(48)} dist/${file.padEnd(48)} ${kb(bytes)}  ${text} chars of text`)
}
console.log('')

// ---------------------------------------------------------------------------

// The URL the build actually baked in (VITE_API_URL from the environment or a
// .env file — Vite reads both, this script only sees the former).
function apiUrl() {
  return API_URL
}

async function loadWithRetry(attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    const result = await loadSite()
    if (result) return result
    if (i < attempts) {
      warn(`Loading content from the API failed (attempt ${i}/${attempts}) — retrying…`)
      await new Promise((r) => setTimeout(r, 2000 * i))
    }
  }
  return null
}

// modulepreload the route's own page chunk (and what it imports) so hydration
// is not left waiting on a lazy import the HTML could have announced up front.
function preloadsFor(moduleId) {
  const seen = new Set()
  const files = []
  const visit = (key) => {
    const chunk = manifest[key]
    if (!chunk || seen.has(key)) return
    seen.add(key)
    if (chunk !== entryChunk) files.push(chunk.file)
    for (const dep of chunk.imports || []) visit(dep)
  }
  visit(moduleId)
  return files.map((f) => `  <link rel="modulepreload" crossorigin href="/${f}" />\n`).join('')
}

async function writeCrawlerFiles(c) {
  await write('sitemap.xml', sitemapXml(c))
  await write('robots.txt', robotsTxt(c))
  await write('llms.txt', llmsTxt(c))
}

// The build manifest is an input to this script, not something to publish.
async function cleanup() {
  await fs.rm(path.join(DIST, '.vite'), { recursive: true, force: true })
}

async function write(rel, body) {
  const file = path.join(DIST, rel)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, body)
}

function textLength(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length
}

function kb(n) {
  return `${(n / 1024).toFixed(1)} KB`.padStart(9)
}

function warn(msg) {
  console.warn(`\n⚠  prerender: ${msg}\n`)
}

function fail(msg) {
  console.error(`\n✖  prerender: ${msg}\n`)
  process.exit(1)
}
