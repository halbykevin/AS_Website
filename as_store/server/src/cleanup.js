// One-off (re-runnable) catalog cleanup: decodes HTML entities and collapses
// breadcrumb category names to a clean leaf, merging any duplicates that result
// (products are repointed to the kept row). Also decodes product text.
//   npm run clean
import 'dotenv/config'
import { pool, query } from './db.js'
import { decodeEntities, cleanCategoryName } from './scraper.js'

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

// Rename + dedupe a lookup table (categories|brands). `fkColumn` is the column on
// products that references it. `computeName(oldName)` returns the cleaned name.
async function cleanTable(table, fkColumn, computeName) {
  const { rows } = await query(`SELECT id, name FROM ${table} ORDER BY id`)
  const targets = rows.map((r) => {
    const name = computeName(r.name).trim() || `item-${r.id}`
    return { id: r.id, name, slug: slugify(name) || `item-${r.id}` }
  })

  // Group by target slug; first id wins, others merge into it.
  const groups = new Map()
  for (const t of targets) {
    if (!groups.has(t.slug)) groups.set(t.slug, [])
    groups.get(t.slug).push(t)
  }

  let merged = 0
  for (const items of groups.values()) {
    const keeper = items[0]
    for (const other of items.slice(1)) {
      await query(`UPDATE products SET ${fkColumn} = $1 WHERE ${fkColumn} = $2`, [keeper.id, other.id])
      await query(`DELETE FROM ${table} WHERE id = $1`, [other.id])
      merged++
    }
  }

  // Two-phase rename to dodge transient unique-slug collisions.
  await query(`UPDATE ${table} SET slug = 'tmp-' || id`)
  let renamed = 0
  for (const items of groups.values()) {
    const keeper = items[0]
    await query(`UPDATE ${table} SET name = $1, slug = $2 WHERE id = $3`, [
      keeper.name,
      keeper.slug,
      keeper.id,
    ])
    renamed++
  }
  return { renamed, merged, remaining: groups.size }
}

const cat = await cleanTable('categories', 'category_id', cleanCategoryName)
console.log('categories:', JSON.stringify(cat))

const brand = await cleanTable('brands', 'brand_id', (n) => decodeEntities(n))
console.log('brands:', JSON.stringify(brand))

// Decode product text fields in place.
const { rows: prods } = await query(`SELECT id, name, tagline, description FROM products`)
let productsFixed = 0
for (const p of prods) {
  const name = decodeEntities(p.name || '').trim()
  const tagline = decodeEntities(p.tagline || '').trim()
  const description = decodeEntities(p.description || '').trim()
  if (name !== p.name || tagline !== p.tagline || description !== p.description) {
    await query(`UPDATE products SET name = $1, tagline = $2, description = $3 WHERE id = $4`, [
      name || p.name,
      tagline,
      description,
      p.id,
    ])
    productsFixed++
  }
}
console.log('products decoded:', productsFixed)

await pool.end()
console.log('Catalog cleanup complete.')
