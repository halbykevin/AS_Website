import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

// Applies every pending NNN_name.sql in order, all in one transaction under an advisory lock.
// `--pending` only reports how many migrations would run, so deploys can back up first.
if (existsSync('.env')) process.loadEnvFile();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const directory = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../migrations/', import.meta.url));
const migrations = (await readdir(directory)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort()
  .map(name => ({ name, version: Number(name.slice(0, 3)) }));
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(48129375)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await client.query<{ version: number }>('SELECT version FROM schema_migrations')).rows.map(row => row.version));
  const pending = migrations.filter(migration => !applied.has(migration.version));
  if (process.argv.includes('--pending')) {
    await client.query('ROLLBACK');
    console.log(pending.length);
  } else {
    for (const migration of pending) {
      await client.query(await readFile(join(directory, migration.name), 'utf8'));
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [migration.version]);
      console.log(`Applied ${migration.name}`);
    }
    await client.query('COMMIT');
    console.log(pending.length ? `Database migrations applied (${pending.length}).` : 'Database schema is up to date.');
  }
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
