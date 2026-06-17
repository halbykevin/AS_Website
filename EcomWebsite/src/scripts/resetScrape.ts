/**
 * Dev helper: remove scraped products + their categories so a re-import is clean.
 *   pnpm payload run src/scripts/resetScrape.ts
 * Deletes products with a sourceUrl (scraper-created) and all categories,
 * plus media. Intended for local testing only.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'node:fs'

const outFile = process.env.RESET_LOG || 'reset-result.log'
const payload = await getPayload({ config })

const prods = await payload.delete({
  collection: 'products',
  where: { sourceUrl: { exists: true } },
})
const cats = await payload.delete({ collection: 'categories', where: {} })
const media = await payload.delete({ collection: 'media', where: {} })

const msg = `Deleted: products=${prods.docs.length}, categories=${cats.docs.length}, media=${media.docs.length}`
fs.writeFileSync(outFile, msg + '\n')
console.log(msg)
