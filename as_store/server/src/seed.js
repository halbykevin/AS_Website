import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db.js'

// Loads as_store/db/seed.sql (idempotent sample catalog): `npm run seed`.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '..', '..', 'db', 'seed.sql')

const sql = fs.readFileSync(file, 'utf8')
await pool.query(sql)
console.log('AS Store sample catalog seeded.')
await pool.end()
