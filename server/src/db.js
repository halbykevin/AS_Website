import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

// Return DATE columns (type OID 1082) as plain 'YYYY-MM-DD' strings instead of
// JS Date objects, so the day isn't shifted by the server's timezone.
pg.types.setTypeParser(1082, (v) => v)

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export const query = (text, params) => pool.query(text, params)
