import 'dotenv/config'
import { pool, query } from './db.js'
import { localizeImage, isLocalImage } from './scraper.js'

// One-time backfill: download every hotlinked product image onto our own disk
// (/uploads) and rewrite product_images.url to the local copy, so the catalog
// stops depending on the shops it was scraped from (and becomes eligible for
// Google Merchant Center / image optimization).
//
// Idempotent: rows already local are skipped, so it's safe to re-run — it only
// picks up whatever is still remote (e.g. after adding more scraped products).
//
//   npm run backfill-images                 # everything still remote
//   npm run backfill-images -- --limit 50   # test on a subset first
//
// IMPORTANT: run this on the SAME machine that serves /uploads (the VPS), with
// PUBLIC_URL set to the public API origin — the files land on that disk and the
// stored urls are built from PUBLIC_URL.

const args = process.argv.slice(2)
const li = args.indexOf('--limit')
const limit = li >= 0 ? Number(args[li + 1]) : null

const { rows } = await query(
  `SELECT id, product_id, url FROM product_images ORDER BY product_id, sort, id`,
)
const remote = rows.filter((r) => r.url && !isLocalImage(r.url))
const todo = limit ? remote.slice(0, limit) : remote

console.log(
  `product_images: ${rows.length} total, ${remote.length} remote` +
    (limit ? `, processing ${todo.length} (--limit ${limit})` : ''),
)
console.log(`PUBLIC_URL = ${process.env.PUBLIC_URL || 'http://localhost:8081 (default)'}`)

let done = 0
let merged = 0
let failed = 0

for (const row of todo) {
  const local = await localizeImage(row.url)
  if (!local || local === row.url) {
    failed++
    continue
  }
  try {
    await query(`UPDATE product_images SET url = $1 WHERE id = $2`, [local, row.id])
    done++
  } catch (e) {
    // Two different remote urls for the same product collapsed to one local file
    // → the unique (product_id, url) blocks the update. Drop the now-duplicate.
    if (e.code === '23505') {
      await query(`DELETE FROM product_images WHERE id = $1`, [row.id])
      merged++
    } else {
      console.error(`  ! image ${row.id} (${row.url}): ${e.message}`)
      failed++
    }
  }
  const n = done + merged + failed
  if (n % 50 === 0) console.log(`  …${n}/${todo.length}  (localized ${done}, merged ${merged}, failed ${failed})`)
}

console.log(`\nDone. localized=${done} merged=${merged} failed=${failed}`)
if (failed) console.log('Failed rows kept their remote url (nothing lost) — re-run later to retry.')
await pool.end()
