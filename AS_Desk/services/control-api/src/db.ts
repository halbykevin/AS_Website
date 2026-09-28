import { randomInt, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import type { Store, Device, AuditEvent } from './store.ts';

const devices = pgTable('devices', {
  id: uuid().primaryKey(), publicId: varchar('public_id', { length: 9 }).notNull().unique(),
  publicKey: text('public_key').notNull().unique(), platform: text().notNull(),
  agentVersion: text('agent_version').notNull(), revokedAt: timestamp('revoked_at', { withTimezone: true })
});
export class PostgresStore implements Store {
  readonly pool: Pool;
  private db;
  constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
    // An idle client can lose its connection (e.g. PostgreSQL restarted). The pool replaces it; without
    // this listener the 'error' event would crash the process.
    this.pool.on('error', () => undefined);
    this.db = drizzle(this.pool);
  }
  async register(publicKey: string, agentVersion: string): Promise<Device> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const rows = await this.db.insert(devices).values({ id: randomUUID(), publicId: String(randomInt(100000000, 1000000000)), publicKey, platform: 'windows', agentVersion })
        .onConflictDoNothing().returning();
      if (rows[0]) return { ...rows[0], platform: 'windows' };
      const existing = await this.db.select().from(devices).where(eq(devices.publicKey, publicKey));
      if (existing[0]) return { ...existing[0], platform: 'windows' };
    }
    throw new Error('ID allocation failed');
  }
  async find(publicId: string): Promise<Device | undefined> {
    const [device] = await this.db.select().from(devices).where(eq(devices.publicId, publicId));
    return device ? { ...device, platform: 'windows' } : undefined;
  }
  async seen(publicId: string) {
    await this.pool.query('UPDATE devices SET last_seen_at=now() WHERE public_id=$1', [publicId]);
  }
  async audit(e: AuditEvent) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (e.type === 'request.created') await client.query(
        "INSERT INTO connection_requests(id,controller_id,target_id,status,requested_at,expires_at) VALUES($1,$2,$3,'pending',$4,$5)",
        [e.requestId, e.actor, e.target, new Date(e.at), new Date(e.at + 30000)]);
      else if (e.type.startsWith('request.')) await client.query(
        'UPDATE connection_requests SET status=$2, resolved_at=$3 WHERE id=$1', [e.requestId, e.type.slice(8), new Date(e.at)]);
      if (e.type === 'request.accepted') await client.query(
        "INSERT INTO sessions(id,request_id,controller_id,target_id,status,accepted_at) VALUES($1,$2,$3,$4,'signaling',$5)",
        [e.sessionId, e.requestId, e.target, e.actor, new Date(e.at)]);
      if (e.type === 'session.ended') await client.query(
        "UPDATE sessions SET status='ended', ended_at=$2, termination_reason=$3 WHERE id=$1", [e.sessionId, new Date(e.at), e.reason]);
      if (e.type === 'session.connected') await client.query(
        "UPDATE sessions SET status='connected',connected_at=COALESCE(connected_at,$2) WHERE id=$1", [e.sessionId, new Date(e.at)]);
      await client.query('INSERT INTO session_events(id,event_type,actor_id,request_id,session_id,occurred_at,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [e.id, e.type, e.actor, e.requestId ?? null, e.sessionId ?? null, new Date(e.at), e.reason ?? null]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async ready() { await this.pool.query('SELECT id FROM devices LIMIT 1'); }
  async recover() {
    // One process owns presence. Old sessions never resume silently after restart.
    await this.pool.query("UPDATE connection_requests SET status='cancelled',resolved_at=now() WHERE status='pending'");
    await this.pool.query("UPDATE sessions SET status='ended',ended_at=now(),termination_reason='server_restart' WHERE status <> 'ended'");
  }
  async close() { await this.pool.end(); }
}
