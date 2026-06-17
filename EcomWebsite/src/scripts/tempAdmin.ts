/** Dev-only: create or delete a temp admin for API testing.
 *   pnpm payload run src/scripts/tempAdmin.ts create
 *   pnpm payload run src/scripts/tempAdmin.ts delete
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const action = process.argv[2] || 'create'
const email = 'synctest@as.local'
const password = 'SyncTest123!'
const payload = await getPayload({ config })

await payload.delete({ collection: 'users', where: { email: { equals: email } } })
if (action === 'create') {
  await payload.create({
    collection: 'users',
    data: { name: 'Sync Test', email, password, roles: ['admin'] },
  })
  console.log('created ' + email)
} else {
  console.log('deleted ' + email)
}
