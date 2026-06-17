/**
 * CLI: import a scrape.py products.json into Payload.
 *   pnpm payload run src/scripts/importScrape.ts <path-to-products.json> [limit]
 *
 * Used to verify the importer end-to-end before the admin Sync button calls it.
 * Uses top-level await so `payload run` waits for the work to finish.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'node:fs'

import { importProducts, type ScrapedProduct } from '@/lib/scraper/importProducts'

const jsonPath = process.argv[2]
const limit = Number(process.argv[3] || 0)
const outFile = process.env.IMPORT_LOG || 'import-result.log'

const lines: string[] = []
const log = (m: string) => {
  lines.push(m)
  console.log(m)
  fs.writeFileSync(outFile, lines.join('\n'))
}

if (!jsonPath || !fs.existsSync(jsonPath)) {
  log(`Usage: payload run src/scripts/importScrape.ts <products.json> [limit] (got: ${jsonPath})`)
} else {
  const products = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as ScrapedProduct[]
  const payload = await getPayload({ config })
  log(`Importing ${products.length} product(s) from ${jsonPath}...`)
  try {
    const summary = await importProducts(payload, products, { limit, log })
    log('\nDone: ' + JSON.stringify(summary, null, 2))
  } catch (err) {
    log('\nFATAL: ' + ((err as Error).stack || (err as Error).message))
  }
}
