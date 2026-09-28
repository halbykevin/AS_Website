import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { WebSocket } from 'ws';
import { z } from 'zod';
import type { ClientMessage } from '../packages/protocol/src/index.ts';

// Development console client for milestone 1; not the production Windows service.
const base = new URL(process.env.REMOTE_API ?? 'http://127.0.0.1:3000');
if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)))
  throw new Error('HTTPS is required outside loopback');
const passphrase = process.env.DEVICE_KEY_PASSPHRASE;
if (!passphrase || passphrase.length < 16) throw new Error('Set DEVICE_KEY_PASSPHRASE (at least 16 characters) to encrypt the local development identity');
const identityPath = resolve(process.argv[2] ?? '.local/device-a.json');
const identitySchema = z.strictObject({ deviceId: z.string().regex(/^[1-9][0-9]{8}$/), privateKey: z.string(), signingPublicKey: z.string(), server: z.string() });
async function post(path: string, body: unknown, token?: string): Promise<Record<string, unknown>> {
  const response = await fetch(new URL(path, base), { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  return await response.json() as Record<string, unknown>;
}
let identity: z.infer<typeof identitySchema>;
try { identity = identitySchema.parse(JSON.parse(await readFile(identityPath, 'utf8'))); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  const enrollment = process.env.ENROLLMENT_TOKEN;
  if (!enrollment) throw new Error('An administrator must supply ENROLLMENT_TOKEN for first enrollment');
  const key = generateKeyPairSync('ed25519');
  const result = await post('/v1/devices/register', { publicKey: key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), platform: 'windows', agentVersion: '0.1.0' }, enrollment);
  identity = identitySchema.parse({ ...result, privateKey: key.privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }).toString(), server: base.origin });
  await mkdir(dirname(identityPath), { recursive: true });
  await writeFile(identityPath, JSON.stringify(identity), { mode: 0o600, flag: 'wx' });
}
if (identity.server !== base.origin) throw new Error('Identity belongs to a different server');
const privateKey = createPrivateKey({ key: identity.privateKey, passphrase });
createPublicKey(privateKey);
const input = createInterface({ input: process.stdin, output: process.stdout });
let socket: WebSocket | undefined;
let stopping = false;
let requestId: string | undefined;
let sessionId: string | undefined;
let incomingPermissions: string[] = [];
let backoff = 1000;
async function connect(): Promise<void> {
  if (stopping) return;
  try {
    const challenge = await post('/v1/devices/auth/challenge', { deviceId: identity.deviceId });
    const auth = await post('/v1/devices/auth/verify', { challengeId: challenge.challengeId,
      signature: sign(null, Buffer.from(String(challenge.message)), privateKey).toString('base64') });
    const ticket = await post('/v1/ws-ticket', {}, String(auth.accessToken));
    const url = new URL('/ws', base); url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(url, ['company-remote.v1', `ticket.${ticket.ticket}`]);
    socket.on('open', () => { backoff = 1000; console.log(`Ready. Your ID: ${identity.deviceId.match(/.{3}/g)!.join(' ')}`); });
    socket.on('message', raw => {
      const message = JSON.parse(raw.toString()).payload;
      if (message.type === 'connection.incoming' || message.type === 'connection.pending') requestId = message.requestId;
      if (message.type === 'connection.incoming') incomingPermissions = message.permissions;
      if (message.type === 'connection.accepted') { requestId = undefined; sessionId = message.sessionId; }
      if (['connection.rejected', 'connection.cancelled', 'connection.expired'].includes(message.type)) requestId = undefined;
      if (message.type === 'session.ended') sessionId = undefined;
      // Never print signed grants, credentials, SDP, or ICE details.
      console.log(message.type, message.sourceId ?? message.targetId ?? message.code ?? message.reason ?? '');
      if (message.type === 'connection.incoming') console.log('Requested permissions:', incomingPermissions.join(', '), '\nType accept or reject.');
      if (message.type === 'connection.accepted') console.log('Session authorized. Milestone 1 has no video or remote input. Type disconnect to end.');
    });
    socket.on('error', () => console.error('Connection failed.'));
    socket.once('close', () => { requestId = undefined; sessionId = undefined; retry(); });
  } catch (error) { console.error(error instanceof Error ? error.message : 'Connection failed'); retry(); }
}
function retry() {
  if (stopping) return;
  const delay = backoff + Math.random() * 500;
  backoff = Math.min(backoff * 2, 30000);
  setTimeout(() => void connect(), delay).unref();
}
function send(payload: ClientMessage) {
  if (socket?.readyState !== WebSocket.OPEN) return console.error('Offline.');
  socket.send(JSON.stringify({ protocolVersion: 1, id: randomUUID(), timestamp: Date.now(), payload }));
}
console.log('Commands: connect <9-digit ID>, accept, reject, cancel, disconnect, quit');
input.on('line', line => {
  const [command, ...parts] = line.trim().split(/\s+/);
  const targetId = parts.join('');
  if (command === 'connect' && /^[1-9][0-9]{8}$/.test(targetId)) send({ type: 'connection.request', targetId, permissions: ['screen', 'mouse', 'keyboard'] });
  else if (command === 'accept' && requestId) send({ type: 'connection.accept', requestId, permissions: ['screen'] });
  else if (command === 'reject' && requestId) send({ type: 'connection.reject', requestId });
  else if (command === 'cancel' && requestId) send({ type: 'connection.cancel', requestId });
  else if (command === 'disconnect' && sessionId) send({ type: 'session.end', sessionId });
  else if (command === 'quit') input.close();
  else console.log('Command unavailable. Accept grants screen permission only in this development client.');
});
input.on('close', () => { stopping = true; socket?.close(); });
await connect();
