/** Dev helper: reset the admin password.
 *   pnpm payload run src/scripts/resetAdminPassword.ts <email> <newPassword>
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const email = process.argv[2] || 'kevinhalbyascompany@gmail.com'
const newPassword = process.argv[3] || 'ASstore2026!'
const payload = await getPayload({ config })

const found = await payload.find({
  collection: 'users',
  where: { email: { equals: email } },
  limit: 1,
})
if (!found.docs[0]) {
  console.log(`No user with email ${email}`)
} else {
  await payload.update({
    collection: 'users',
    id: found.docs[0].id,
    data: { password: newPassword },
  })
  console.log(`Password reset for ${email}`)
}
