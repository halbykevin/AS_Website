import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

// Return NUMERIC (OID 1700) as JS numbers instead of strings, so price/old_price
// come back as numbers in API responses.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)))

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export const query = (text, params) => pool.query(text, params)
