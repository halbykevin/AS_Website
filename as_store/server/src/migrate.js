import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db.js'

// Applies as_store/db/*.sql in order (idempotent). Lets the DB be rebuilt
// without pgAdmin: `npm run migrate`.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbDir = path.join(__dirname, '..', '..', 'db')

// Order matters twice over: loyalty.sql came after spin.sql because redeeming
// points minted a row in `vouchers`, and wallet.sql comes after loyalty.sql
// because it converts whatever balance that ledger holds into store credit.
// loyalty.sql is still applied — the tables it creates are retained but no
// longer read, so a DB rebuilt from scratch still has somewhere for that
// conversion to look.
for (const name of ['schema.sql', 'notifications.sql', 'spin.sql', 'loyalty.sql', 'wallet.sql']) {
  const sql = fs.readFileSync(path.join(dbDir, name), 'utf8')
  await pool.query(sql)
  console.log(`AS Store ${name} applied.`)
}
await pool.end()
