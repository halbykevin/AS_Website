import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db.js'

// Applies as_store/db/*.sql in order (idempotent). Lets the DB be rebuilt
// without pgAdmin: `npm run migrate`.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbDir = path.join(__dirname, '..', '..', 'db')

for (const name of ['schema.sql', 'notifications.sql', 'spin.sql']) {
  const sql = fs.readFileSync(path.join(dbDir, name), 'utf8')
  await pool.query(sql)
  console.log(`AS Store ${name} applied.`)
}
await pool.end()
