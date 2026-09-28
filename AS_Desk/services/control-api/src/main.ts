import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { buildApp } from './app.ts';
import { PostgresStore } from './db.ts';

if (existsSync('.env')) process.loadEnvFile();
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(v => v === '' ? undefined : v, schema.optional());
const env = z.object({
  DATABASE_URL: z.string().url(),
  // open: any computer that installs the app may register (like a public remote-desktop service).
  // token: registration requires ENROLLMENT_TOKEN.
  ENROLLMENT_MODE: z.enum(['open', 'token']).default('token'), ENROLLMENT_TOKEN: optional(z.string().min(32)),
  SESSION_SIGNING_KEY_BASE64: z.string().min(32), HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TURN_SECRET: optional(z.string().min(32)), TURN_URLS: optional(z.string()),
  // Address of the local reverse proxy, e.g. 127.0.0.1. Unset means forwarded headers are ignored.
  TRUST_PROXY: optional(z.string())
}).refine(e => e.ENROLLMENT_MODE === 'open' || e.ENROLLMENT_TOKEN, { path: ['ENROLLMENT_TOKEN'], message: 'Required unless ENROLLMENT_MODE=open' })
  .parse(process.env);
const store = new PostgresStore(env.DATABASE_URL);
// Session ownership is deliberately single-process until distributed presence is implemented.
// A restarting predecessor may still hold the lock for a moment, so wait briefly before refusing.
async function acquireOwnership() {
  const deadline = Date.now() + 30000;
  for (;;) {
    const lease = await store.pool.connect();
    const lock = await lease.query('SELECT pg_try_advisory_lock(48129376) AS acquired');
    if (lock.rows[0]?.acquired) return lease;
    lease.release();
    if (Date.now() > deadline) throw new Error('Another control-plane instance owns this database');
    await sleep(1000);
  }
}
const lease = await acquireOwnership();
lease.on('error', () => process.exit(1)); // loss of exclusive ownership must stop serving
await store.ready();
await store.recover();
const { app } = await buildApp(store, {
  enrollmentToken: env.ENROLLMENT_MODE === 'open' ? undefined : env.ENROLLMENT_TOKEN,
  signingKey: Buffer.from(env.SESSION_SIGNING_KEY_BASE64, 'base64').toString('utf8'),
  turnSecret: env.TURN_SECRET, turnUrls: env.TURN_URLS?.split(',').map(url => url.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY, logger: true
});
app.addHook('preClose', async () => { lease.release(); });
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  if (closing) return;
  closing = true;
  setTimeout(() => process.exit(1), 10000).unref();
  void app.close().then(() => process.exit(0), () => process.exit(1));
});
await app.listen({ host: env.HOST, port: env.PORT });
