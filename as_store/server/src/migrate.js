import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db.js'

// Applies as_store/db/schema.sql (idempotent). Lets the DB be rebuilt without
// pgAdmin: `npm run migrate`.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '..', '..', 'db', 'schema.sql')

const sql = fs.readFileSync(file, 'utf8')
await pool.query(sql)
console.log('AS Store schema applied.')
await pool.end()
