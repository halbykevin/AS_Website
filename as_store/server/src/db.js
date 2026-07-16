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

// Run several statements on one connection inside a transaction, rolling back
// if any of them throws. `fn` receives a client whose .query has the same shape
// as the exported one.
export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
