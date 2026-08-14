// Offline catalog import — the manual half of the admin "Import products" tool,
// for when the source shop blocks the VPS's IP and the scrape has to run from
// somewhere else (a laptop).
//
// The flow it is built for:
//   1. laptop:  python scrape.py --site <shop> --out run --name products --format json
//   2. laptop:  node src/import-scrape.js run/products.json --stage-images stage
//   3. upload `stage/` into the server's UPLOAD_DIR, and products.json anywhere
//   4. VPS:     node src/import-scrape.js /tmp/products.json --purge
//
// Step 2 downloads the photos with the exact content-addressed filenames the
// ingest looks for, so step 4 finds every image already on disk and never has
// to reach the blocked shop.
//
// It reuses ingestProducts() — the same upsert the admin tool runs — so it is
// idempotent and additive: it never writes categories.image_url, never deletes
// a row, and never replaces an existing product image. See --dry-run.
//
// --delist is the one thing that goes the other way: it hides what the shop no
// longer lists, turning a full-site run into a mirror. Still no deletes.

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'

const USAGE = `
Import a scraped products.json into the catalog (or stage its images first).

  node src/import-scrape.js <products.json | run-dir> [options]

Options
  --stage-images <dir>  Only download the product photos, into <dir>, using the
                        filenames the ingest expects. Never touches the database.
  --dry-run             Report what the import would change. Read-only.
  --purge               After a successful import, purge the storefront cache so
                        the new products show up immediately.
  --delist              Hide the products this file does not contain — i.e. the
                        ones the shop has dropped. Only for a whole-catalog
                        scrape: on a partial file it would hide the rest of the
                        shop. Nothing is deleted, and a product that comes back
                        is un-hidden by the next run.
  --delist-floor <0-1>  How much of what we already hold from that shop the file
                        must cover before --delist is trusted (default 0.5).
  --workers <n>         Parallel image downloads (default 6).
  --limit <n>           Only handle the first n products of the file.
`

function parseArgs(argv) {
  const opts = { file: '', stageDir: '', dryRun: false, purge: false, workers: 6, limit: 0, delist: false, delistFloor: 0.5 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--stage-images') opts.stageDir = argv[++i]
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--purge') opts.purge = true
    else if (a === '--delist') opts.delist = true
    else if (a === '--delist-floor') opts.delistFloor = Number(argv[++i])
    else if (a === '--workers') opts.workers = Number(argv[++i])
    else if (a === '--limit') opts.limit = Number(argv[++i])
    else if (a === '-h' || a === '--help') opts.help = true
    else if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`)
    else opts.file = a
  }
  return opts
}

let opts
try {
  opts = parseArgs(process.argv.slice(2))
} catch (e) {
  console.error(e.message, '\n', USAGE)
  process.exit(1)
}
if (opts.help || !opts.file) {
  console.log(USAGE)
  process.exit(opts.file ? 0 : 1)
}
if (!(opts.delistFloor >= 0 && opts.delistFloor <= 1)) {
  console.error('--delist-floor must be between 0 and 1.')
  process.exit(1)
}

// A run folder (server/scrapes/<id>) holds products.json — accept either.
let file = path.resolve(opts.file)
if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'products.json')
if (!fs.existsSync(file)) {
  console.error(`Not found: ${file}`)
  process.exit(1)
}

// Staging writes into the chosen folder instead of the live uploads dir. Set
// before scraper.js is imported — it reads UPLOAD_DIR once, at module load.
if (opts.stageDir) {
  const dir = path.resolve(opts.stageDir)
  fs.mkdirSync(dir, { recursive: true })
  process.env.UPLOAD_DIR = dir
}

const { ingestProducts, findDelisted, localizeImage, isLocalImage, imageHash, existingForHash, slugify, cleanCategoryName, normalizeUrl, isPlaceholderImage } =
  await import('./scraper.js')

let products = JSON.parse(fs.readFileSync(file, 'utf8'))
if (!Array.isArray(products)) {
  console.error('That file is not a scraper products.json (expected a JSON array).')
  process.exit(1)
}
if (opts.limit > 0) products = products.slice(0, opts.limit)

// --limit deliberately truncates the file, which is exactly the shape that makes
// delisting dangerous — everything past n would read as "gone from the shop".
if (opts.delist && opts.limit > 0) {
  console.error('--delist cannot be combined with --limit: a truncated file would hide the rest of the catalog.')
  process.exit(1)
}

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(path.dirname(file), 'uploads'))
console.log(`${products.length} product(s) from ${file}`)

// Every image the ingest would try to save, de-duplicated (it caps galleries at
// 8). Placeholders — the source shop's own logo on products it has no photo for —
// are excluded here too, so we never even spend the bandwidth on them.
const imageUrls = []
const placeholderUrls = new Set()
{
  const seen = new Set()
  for (const p of products) {
    for (const raw of (Array.isArray(p?.images) ? p.images : []).slice(0, 8)) {
      const url = String(raw || '').trim()
      if (!url || isLocalImage(url) || seen.has(url)) continue
      seen.add(url)
      if (isPlaceholderImage(url)) placeholderUrls.add(url)
      else imageUrls.push(url)
    }
  }
}
if (placeholderUrls.size) {
  console.log(`placeholder image(s) ignored: ${placeholderUrls.size}`)
  for (const u of placeholderUrls) console.log(`  ${u}`)
}

// --- Stage images (laptop) -------------------------------------------------
if (opts.stageDir) {
  console.log(`Staging ${imageUrls.length} image(s) into ${UPLOAD_DIR}\n`)
  const workers = Math.min(16, Math.max(1, opts.workers || 6))
  const failed = []
  let done = 0
  let saved = 0
  let cached = 0

  let next = 0
  const worker = async () => {
    while (next < imageUrls.length) {
      const url = imageUrls[next++]
      if (existingForHash(imageHash(url))) cached++
      else if (await localizeImage(url)) saved++
      else failed.push(url)
      if (++done % 100 === 0 || done === imageUrls.length) {
        console.log(`  …${done}/${imageUrls.length}  (downloaded ${saved}, already there ${cached}, failed ${failed.length})`)
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, worker))

  if (failed.length) {
    const list = path.join(UPLOAD_DIR, 'failed-images.txt')
    fs.writeFileSync(list, failed.join('\n') + '\n')
    console.log(`\n${failed.length} image(s) could not be downloaded — listed in ${list}`)
    console.log('Re-run this same command to retry them (finished files are skipped).')
  }
  console.log(`\nStaged. downloaded=${saved} already-there=${cached} failed=${failed.length}`)
  // sync-catalog.mjs drives this step itself and does the copying for you — the
  // hand-carry instructions only make sense when a human ran it directly.
  if (!process.env.AS_SYNC_CATALOG) {
    console.log(`Next: copy the contents of ${UPLOAD_DIR} into the server's UPLOAD_DIR, then run this`)
    console.log('script there without --stage-images.')
  }
  process.exit(0)
}

// --- Database paths --------------------------------------------------------
const { pool, query } = await import('./db.js')

const staged = imageUrls.filter((u) => existingForHash(imageHash(u))).length
console.log(`images: ${imageUrls.length} referenced, ${staged} already in ${UPLOAD_DIR}`)
if (staged < imageUrls.length) {
  console.log(
    `         ${imageUrls.length - staged} would be downloaded from the source shop — which fails if this\n` +
      '         machine is blocked. Stage them first (--stage-images) if that is the case;\n' +
      "         anything that can't be fetched keeps the source's own url instead.",
  )
}

if (opts.dryRun) {
  // Read-only preflight: what the ingest would create vs. update, and proof that
  // the categories you gave images to are only ever matched, never rewritten.
  let create = 0
  let update = 0
  let skip = 0
  const catNames = new Map()

  for (const p of products) {
    const name = String(p?.name || '').trim()
    const price = Number(p?.price)
    if (!name && !(Number.isFinite(price) && price)) {
      skip++
      continue
    }
    const url = String(p?.url || '').trim()
    if (url) {
      const { rows } = await query(
        `SELECT 1 FROM products WHERE source_url = $1 OR source_url = $2 LIMIT 1`,
        [normalizeUrl(url), url],
      )
      rows[0] ? update++ : create++
    } else create++

    const rawPath =
      Array.isArray(p.category_path) && p.category_path.length
        ? p.category_path
        : Array.isArray(p.categories) && p.categories.length
          ? [cleanCategoryName(p.categories[0])]
          : []
    for (const nm of rawPath.slice(0, 2)) {
      const clean = cleanCategoryName(nm)
      const s = slugify(clean)
      if (s) catNames.set(s, clean)
    }
  }

  const slugs = [...catNames.keys()]
  const { rows: existing } = await query(
    `SELECT slug, name, image_url FROM categories WHERE slug = ANY($1::text[])`,
    [slugs],
  )
  const withImage = existing.filter((r) => r.image_url).length

  console.log('\n-- dry run, nothing was written ------------------------------')
  console.log(`products:   ~${create} new, ~${update} updated, ${skip} skipped (no name and no price)`)
  console.log(`categories: ${slugs.length} referenced — ${existing.length} already exist, ${slugs.length - existing.length} would be created`)
  console.log(`            ${withImage} of the existing ones have an image; the import keeps every one of them`)
  console.log('            (it only ever inserts a missing slug — name, image, sort and visibility are left alone)')

  // The same read the real --delist run does, so this is the actual list.
  const { hosts, owned, missing } = await findDelisted(products)
  if (owned.length) {
    const covered = owned.length - missing.length
    const pct = Math.round((covered / owned.length) * 100)
    console.log(`\ndelisting:  we hold ${owned.length} product(s) from ${hosts.join(', ')}; this file covers ${covered} (${pct}%)`)
    if (!opts.delist) {
      console.log(`            ${missing.length} not in the file — run with --delist to hide them, otherwise they stay live`)
    } else if (pct / 100 < opts.delistFloor) {
      console.log(`            below the ${Math.round(opts.delistFloor * 100)}% floor — --delist would refuse and hide NOTHING`)
    } else {
      // Same rule as applyDelist: live and unstamped only, so this list is
      // exactly what the real run would touch.
      const live = missing.filter((r) => r.visible && !r.delisted_at)
      const kept = missing.length - live.length
      console.log(`            --delist would hide ${live.length}${kept ? ` (${kept} already hidden, or kept live by hand)` : ''}:`)
      for (const r of live.slice(0, 25)) console.log(`              · ${r.name}`)
      if (live.length > 25) console.log(`              … and ${live.length - 25} more`)
      const gone = new Set(missing)
      const back = owned.filter((r) => r.delisted_at && !gone.has(r)).length
      if (back) console.log(`            and un-hide ${back} that the shop lists again`)
    }
  }

  console.log('\nNote: a product that the scrape puts in a category will be moved there, so a')
  console.log('manual re-categorisation in the admin is the one edit a re-import can overwrite.')
  await pool.end()
  process.exit(0)
}

// --- Category safety net ---------------------------------------------------
// The ingest is written never to touch a category's own content — but "written
// never to" is not the same as "cannot". So: snapshot every category first, dump
// a one-command restore file next to the import, and afterwards compare row by
// row and put back anything that moved. The hand-uploaded category and
// subcategory images are the whole point of this.

const CATEGORY_FIELDS = ['name', 'slug', 'image_url', 'tagline', 'sort', 'visible', 'show_in_nav', 'parent_id']

const snapshotCategories = async () =>
  (await query(`SELECT id, ${CATEGORY_FIELDS.join(', ')} FROM categories ORDER BY id`)).rows

const sqlLiteral = (v) =>
  v === null || v === undefined ? 'NULL'
  : typeof v === 'number' ? String(v)
  : typeof v === 'boolean' ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`

function writeCategoryBackup(rows) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const out = path.join(path.dirname(file), `categories-backup-${stamp}.sql`)
  const body = rows
    .map((r) => `UPDATE categories SET ${CATEGORY_FIELDS.map((f) => `${f} = ${sqlLiteral(r[f])}`).join(', ')} WHERE id = ${r.id};`)
    .join('\n')
  fs.writeFileSync(
    out,
    `-- AS Store categories as they were before an offline import — ${rows.length} row(s), ${new Date().toISOString()}\n` +
      `-- Restore every one of them with:\n--   psql "$DATABASE_URL" -f ${path.basename(out)}\n` +
      `BEGIN;\n${body}\nCOMMIT;\n`,
  )
  return out
}

// Put back any field the import managed to change on a category that already
// existed. Returns the list of what had to be restored — empty is the normal,
// expected result.
async function restoreCategories(before) {
  const after = new Map((await snapshotCategories()).map((r) => [r.id, r]))
  const repaired = []
  const same = (a, b) => String(a ?? '') === String(b ?? '')

  for (const was of before) {
    const now = after.get(was.id)
    if (!now) {
      repaired.push({ slug: was.slug, fields: ['ROW DELETED — restore from the backup file'], fatal: true })
      continue
    }
    const fields = CATEGORY_FIELDS.filter((f) => !same(now[f], was[f]))
    if (!fields.length) continue
    await query(
      `UPDATE categories SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [was.id, ...fields.map((f) => was[f])],
    )
    repaired.push({ slug: was.slug, fields })
  }
  return repaired
}

const categoriesBefore = await snapshotCategories()
const backupFile = writeCategoryBackup(categoriesBefore)
const imagesBefore = categoriesBefore.filter((r) => r.image_url).length
console.log(`\ncategories: ${categoriesBefore.length} rows, ${imagesBefore} with an image — backed up to ${backupFile}`)

// --- Import ----------------------------------------------------------------
// Set when --delist was asked for but the coverage guard refused it: the import
// itself succeeded, so this can't throw, but it must not exit 0 either — the
// sync script reads that to tell you the mirror is incomplete.
let delistFailed = false
console.log('\nImporting…')
const summary = await ingestProducts(products, { delist: opts.delist, delistFloor: opts.delistFloor })
console.log(
  `Done. ${summary.created} new, ${summary.updated} updated, ${summary.skipped} skipped · ` +
    `${summary.brands} brand(s), ${summary.categories} categor(ies)` +
    (summary.placeholders ? ` · ${summary.placeholders} placeholder image(s) not imported` : '') +
    '.',
)
if (summary.unpriced) {
  console.log(`${summary.unpriced} new product(s) had no price — imported HIDDEN, price them in /admin/products.`)
}
if (summary.delisted) {
  const d = summary.delisted
  if (d.aborted) {
    // Loud, and a non-zero exit: the products import fine, but the mirror did
    // not happen and the catalog is now stale in a way nobody would notice.
    console.log(`\nDELISTING SKIPPED — ${d.aborted}.`)
    console.log('The products above were still imported. Re-run the scrape, or lower --delist-floor if you')
    console.log('really did mean to drop that much of the catalog.')
    delistFailed = true
  } else {
    console.log(
      `delisted: ${d.hidden} product(s) hidden (gone from ${d.hosts.join(', ')}), ` +
        `${d.restored} un-hidden (listed again) — of ${d.checked} we hold from there.`,
    )
    if (d.hidden) console.log('          they keep their photos and order history; un-hide any of them in /admin/products.')
  }
}

// Drop any placeholder an EARLIER import already stored — the logo rows are
// there under their localized name, which is a hash of the source URL, so the
// scrape file we just read is what makes them findable. This is the one thing
// the import deletes, and only ever a row whose url is a known placeholder.
if (placeholderUrls.size) {
  const remotes = [...placeholderUrls] // stored as-is when a download failed
  const localized = remotes.map((u) => `%/scrape-${imageHash(u)}.%`) // the usual case
  const { rowCount } = await query(
    `DELETE FROM product_images
      WHERE url = ANY($1::text[])
         OR url LIKE ANY($2::text[])`,
    [remotes, localized],
  )
  const { rows: orphans } = await query(
    `SELECT count(*)::int AS n FROM products p
      WHERE NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)`,
  )
  console.log(`placeholders: ${rowCount} image row(s) removed · ${orphans[0].n} product(s) now have no photo`)
  if (orphans[0].n) console.log('              those show the AS Store placeholder on the site.')
}

// Verify the categories came through untouched — and repair them if not.
const repaired = await restoreCategories(categoriesBefore)
const categoriesAfter = await snapshotCategories()
const imagesAfter = categoriesAfter.filter((r) => r.image_url).length
const added = categoriesAfter.length - categoriesBefore.length

if (repaired.length) {
  console.log(`\n!! ${repaired.length} existing category/categories were modified — restored:`)
  for (const r of repaired) console.log(`   ${r.slug}: ${r.fields.join(', ')}`)
  if (repaired.some((r) => r.fatal)) console.log(`   Restore the rest with: psql "$DATABASE_URL" -f ${backupFile}`)
} else {
  console.log(`\ncategories: all ${categoriesBefore.length} existing rows untouched` + (added ? `, ${added} new one(s) added` : ''))
}
console.log(`            ${imagesAfter} with an image (was ${imagesBefore})${imagesAfter === imagesBefore ? ' — none lost' : ' — CHECK THIS'}`)

// The storefront caches its data under the 'store' tag for an hour and only
// purges when the admin UI saves something — a direct import like this one has
// to ask for that purge itself, or the new products stay invisible for up to 1h.
if (opts.purge) {
  const api = (process.env.PUBLIC_URL || 'http://localhost:8081').replace(/\/$/, '')
  const store = (process.env.STORE_PUBLIC_URL || process.env.STORE_URL || '').replace(/\/$/, '')
  try {
    if (!store) throw new Error('STORE_URL / STORE_PUBLIC_URL is not set in .env')
    const login = await fetch(`${api}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
    })
    if (!login.ok) throw new Error(`login failed (${login.status})`)
    const { token } = await login.json()
    const res = await fetch(`${store}/api/revalidate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`revalidate failed (${res.status})`)
    console.log(`Storefront cache purged (${store}).`)
  } catch (e) {
    console.log(`Could not purge the storefront cache: ${e.message}`)
    console.log('Save anything in the admin (it purges on write), or wait up to an hour.')
  }
}

await pool.end()
if (delistFailed) process.exit(3)
