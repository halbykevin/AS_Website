/** Dev-only: remove the temp test admin + the leftover Payload demo product
 * (any product with no sourceUrl, i.e. not created by the scraper).
 *   pnpm payload run src/scripts/cleanup.ts
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const payload = await getPayload({ config })

const u = await payload.delete({
  collection: 'users',
  where: { email: { equals: 'synctest@as.local' } },
})
const demo = await payload.delete({
  collection: 'products',
  where: { sourceUrl: { exists: false } },
})
console.log(`removed: tempAdmins=${u.docs.length}, demoProducts=${demo.docs.length}`)
