import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PostgresStore } from '../src/db.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL migration, unique enrollment, durable audit and restart recovery', { skip: !databaseUrl }, async () => {
  const admin = new Pool({ connectionString: databaseUrl });
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(databaseUrl!); url.searchParams.set('options', `-c search_path=${schema}`);
  const store = new PostgresStore(url.toString());
  try {
    for (const migration of ['001_initial.sql', '002_device_last_seen.sql'])
      await store.pool.query(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    await store.ready();
    const publicKey = () => generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const key = publicKey();
    const [a, same] = await Promise.all([store.register(key, '0.1.0'), store.register(key, '0.1.0')]);
    assert.equal(a.publicId, same.publicId);
    const b = await store.register(publicKey(), '0.1.0');
    const requestId = randomUUID(); const sessionId = randomUUID();
    await store.audit({ id: randomUUID(), at: Date.now(), type: 'request.created', actor: a.publicId, target: b.publicId, requestId });
    await store.audit({ id: randomUUID(), at: Date.now(), type: 'request.accepted', actor: b.publicId, target: a.publicId, requestId, sessionId });
    assert.equal((await store.pool.query('SELECT status FROM sessions WHERE id=$1', [sessionId])).rows[0].status, 'signaling');
    await store.recover();
    const row = (await store.pool.query('SELECT status,termination_reason FROM sessions WHERE id=$1', [sessionId])).rows[0];
    assert.equal(row.status, 'ended'); assert.equal(row.termination_reason, 'server_restart');
    assert.equal((await store.find(a.publicId))?.publicKey, key);
    await store.seen(a.publicId);
    assert.ok((await store.pool.query('SELECT last_seen_at FROM devices WHERE public_id=$1', [a.publicId])).rows[0].last_seen_at);
  } finally {
    await store.close();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
