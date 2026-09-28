import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync, spawn } from 'node:child_process';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WebSocket } from 'ws';

// Runs the bundled release (tools/build-server.mjs) against a disposable PostgreSQL:
// migrations, startup, enrollment, authentication, WebSocket upgrade, admin CLI and restart ownership.
const release = resolve(process.argv[2] ?? '.deploy-out/release');
const data = resolve('.local', `smoke-pg-${Date.now()}`);
const port = 54000 + Math.floor(Math.random() * 1000);
const pg = new EmbeddedPostgres({ databaseDir: data, user: 'smoke', password: 'smoke-password', port, persistent: false, onLog: () => {} });
const token = randomBytes(32).toString('base64url');
const signing = Buffer.from(generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64');
const apiPort = 47000 + Math.floor(Math.random() * 1000);
const env = { ...process.env, DATABASE_URL: `postgres://smoke:smoke-password@127.0.0.1:${port}/asdesk`, ENROLLMENT_TOKEN: token,
  SESSION_SIGNING_KEY_BASE64: signing, HOST: '127.0.0.1', PORT: String(apiPort), TRUST_PROXY: '127.0.0.1',
  TURN_SECRET: randomBytes(32).toString('base64url'), TURN_URLS: 'turn:turn.example.test:3478?transport=udp' };
const node = (script, args = []) => execFileSync(process.execPath, ['--enable-source-maps', resolve(release, 'dist', script), ...args], { env, encoding: 'utf8', cwd: release });
const api = (path, init = {}) => fetch(`http://127.0.0.1:${apiPort}${path}`, { ...init, headers: { 'content-type': 'application/json', ...init.headers } });
const check = (condition, message) => { if (!condition) throw new Error(`FAIL: ${message}`); console.log(`ok - ${message}`); };
function start() {
  const child = spawn(process.execPath, ['--enable-source-maps', resolve(release, 'dist/server.mjs')], { env, cwd: release, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', d => process.stderr.write(d));
  return child;
}
async function waitReady() {
  for (let i = 0; i < 100; i++) {
    try { if ((await api('/ready')).ok) return; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('server did not become ready');
}
await pg.initialise();
await pg.start();
let server;
try {
  await pg.createDatabase('asdesk');
  check(node('migrate.mjs', ['--pending']).trim() === '2', 'two migrations pending on an empty database');
  console.log(node('migrate.mjs').trim());
  check(node('migrate.mjs', ['--pending']).trim() === '0', 'migrations are idempotent');
  server = start();
  await waitReady();
  check((await (await api('/health')).json()).status === 'ok', 'bundled server answers /health');
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  check((await api('/v1/devices/register', { method: 'POST', headers: { authorization: 'Bearer wrong-token-wrong-token-wrong-token' }, body: JSON.stringify({ publicKey, platform: 'windows', agentVersion: '0.3.0' }) })).status === 403, 'wrong enrollment token is rejected');
  const enrolled = await (await api('/v1/devices/register', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ publicKey, platform: 'windows', agentVersion: '0.3.0' }) })).json();
  check(/^[1-9]\d{8}$/.test(enrolled.deviceId), `device enrolled as ${enrolled.deviceId}`);
  const challenge = await (await api('/v1/devices/auth/challenge', { method: 'POST', body: JSON.stringify({ deviceId: enrolled.deviceId }) })).json();
  const { accessToken } = await (await api('/v1/devices/auth/verify', { method: 'POST', body: JSON.stringify({ challengeId: challenge.challengeId, signature: sign(null, Buffer.from(challenge.message), keys.privateKey).toString('base64') }) })).json();
  check(typeof accessToken === 'string', 'Ed25519 challenge authentication succeeds');
  const { ticket } = await (await api('/v1/ws-ticket', { method: 'POST', headers: { authorization: `Bearer ${accessToken}` }, body: '{}' })).json();
  const online = await new Promise((done, fail) => {
    const socket = new WebSocket(`ws://127.0.0.1:${apiPort}/ws`, ['company-remote.v1', `ticket.${ticket}`]);
    socket.once('message', raw => { socket.close(); done(JSON.parse(raw.toString()).payload); });
    socket.once('error', fail);
  });
  check(online.type === 'device.online' && online.deviceId === enrolled.deviceId, 'WebSocket upgrade with a one-use ticket');
  check(node('admin.mjs', ['devices']).includes(enrolled.deviceId), 'admin CLI lists the device with last-seen time');
  node('admin.mjs', ['revoke', enrolled.deviceId]);
  const retry = await (await api('/v1/devices/auth/challenge', { method: 'POST', body: JSON.stringify({ deviceId: enrolled.deviceId }) })).json();
  check((await api('/v1/devices/auth/verify', { method: 'POST', body: JSON.stringify({ challengeId: retry.challengeId, signature: sign(null, Buffer.from(retry.message), keys.privateKey).toString('base64') }) })).status === 401, 'revoked device cannot authenticate');
  node('admin.mjs', ['restore', enrolled.deviceId]);
  // A replacement process waits for the database ownership lock instead of failing while the old one stops.
  const replacement = start();
  await new Promise(r => setTimeout(r, 1500));
  check(replacement.exitCode === null, 'replacement waits while the previous instance owns the database');
  const stopped = new Promise(r => server.once('exit', r));
  server.kill('SIGTERM');
  await stopped;
  server = replacement;
  await waitReady();
  check(true, 'replacement takes ownership after the previous instance stops');
  console.log('PASS: bundled release verified against PostgreSQL');
  console.log(`TEST_DATABASE_URL=${env.DATABASE_URL}`);
  if (process.env.SMOKE_RUN_PG_TEST) execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--test', 'services/control-api/test/postgres.test.ts'],
    { stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: env.DATABASE_URL } });
} finally {
  server?.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 500));
  await pg.stop();
  await rm(data, { recursive: true, force: true });
}
