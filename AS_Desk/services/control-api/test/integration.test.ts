import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { buildApp } from '../src/app.ts';
import { MemoryStore } from './memory-store.ts';
import type { ClientMessage } from '../../../packages/protocol/src/index.ts';

test('two native clients register, authenticate, connect, consent and signal over real WebSockets', { timeout: 15000 }, async t => {
  const store = new MemoryStore();
  const signing = generateKeyPairSync('ed25519');
  const enrollment = 'test-enrollment-token-32-characters-long';
  const { app } = await buildApp(store, { enrollmentToken: enrollment,
    signingKey: signing.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    turnSecret: 'test-turn-secret-32-characters-long', turnUrls: ['turn:localhost:3478'] });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address(); assert.ok(address && typeof address !== 'string');
  const url = `ws://127.0.0.1:${address.port}/ws`;
  const sockets: WebSocket[] = [];
  t.after(async () => { for (const socket of sockets) socket.terminate(); await app.close(); });
  async function client() {
    const key = generateKeyPairSync('ed25519');
    const registration = await app.inject({ method: 'POST', url: '/v1/devices/register', headers: { authorization: `Bearer ${enrollment}` }, payload: {
      publicKey: key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), platform: 'windows', agentVersion: '0.1.0'
    } });
    assert.equal(registration.statusCode, 201);
    const deviceId = registration.json().deviceId as string;
    assert.match(deviceId, /^[1-9][0-9]{8}$/);
    const challenge = (await app.inject({ method: 'POST', url: '/v1/devices/auth/challenge', payload: { deviceId } })).json();
    const auth = await app.inject({ method: 'POST', url: '/v1/devices/auth/verify', payload: {
      challengeId: challenge.challengeId, signature: sign(null, Buffer.from(challenge.message), key.privateKey).toString('base64')
    } });
    assert.equal(auth.statusCode, 200);
    const headers = { authorization: `Bearer ${auth.json().accessToken}` };
    const ticket = (await app.inject({ method: 'POST', url: '/v1/ws-ticket', headers })).json().ticket;
    const socket = new WebSocket(url, ['company-remote.v1', `ticket.${ticket}`]); sockets.push(socket);
    const inbox: Record<string, unknown>[] = [];
    const waiters: (() => void)[] = [];
    socket.on('message', raw => { inbox.push(JSON.parse(raw.toString()).payload); waiters.splice(0).forEach(resolve => resolve()); });
    async function next(type: string): Promise<Record<string, unknown>> {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const index = inbox.findIndex(m => m.type === type);
        if (index >= 0) return inbox.splice(index, 1)[0]!;
        await new Promise<void>(resolve => { const timer = setTimeout(resolve, 50); waiters.push(() => { clearTimeout(timer); resolve(); }); });
      }
      throw new Error(`Missing ${type}; received ${JSON.stringify(inbox)}`);
    }
    await next('device.online');
    const send = (payload: ClientMessage) => socket.send(JSON.stringify({ protocolVersion: 1, id: randomUUID(), timestamp: Date.now(), payload }));
    return { deviceId, headers, next, send, socket, ticket };
  }
  const a = await client(); const b = await client(); const c = await client();
  assert.equal((await app.inject({ method: 'POST', url: '/v1/devices/register', payload: {} })).statusCode, 401);
  a.send({ type: 'connection.request', targetId: b.deviceId, permissions: ['screen', 'mouse'] });
  const incoming = await b.next('connection.incoming');
  assert.equal(incoming.sourceId, a.deviceId);
  b.send({ type: 'connection.accept', requestId: incoming.requestId as string, permissions: ['screen'] });
  const accepted = await a.next('connection.accepted');
  assert.equal(accepted.sessionId, (await b.next('connection.accepted')).sessionId);
  const sessionId = accepted.sessionId as string;
  assert.equal((await app.inject({ method: 'POST', url: '/v1/turn/credentials', headers: c.headers, payload: { sessionId } })).statusCode, 403);
  const turn = await app.inject({ method: 'POST', url: '/v1/turn/credentials', headers: a.headers, payload: { sessionId } });
  assert.equal(turn.statusCode, 200); assert.ok(turn.json().iceServers[0].credential);
  a.send({ type: 'webrtc.offer', sessionId, sdp: 'test-offer' });
  assert.equal((await b.next('webrtc.offer')).sdp, 'test-offer');
  b.send({ type: 'webrtc.answer', sessionId, sdp: 'test-answer' });
  assert.equal((await a.next('webrtc.answer')).sdp, 'test-answer');
  b.send({ type: 'session.end', sessionId });
  await a.next('session.ended');
  assert.equal((await app.inject({ method: 'POST', url: '/v1/turn/credentials', headers: a.headers, payload: { sessionId } })).statusCode, 403);
  const replay = new WebSocket(url, ['company-remote.v1', `ticket.${a.ticket}`]);
  const error = await new Promise<Error>(resolve => replay.once('error', resolve));
  assert.match(error.message, /401/);
  assert.ok(store.events.some(e => e.type === 'request.accepted'));
  assert.ok(store.events.every(e => !JSON.stringify(e).includes('test-offer')));
});

test('enrollment is gated by the token unless the server is open', async () => {
  const signingKey = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const payload = () => ({ publicKey: generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), platform: 'windows', agentVersion: '0.4.0' });
  const gated = (await buildApp(new MemoryStore(), { enrollmentToken: 'test-enrollment-token-32-characters-long', signingKey })).app;
  const open = (await buildApp(new MemoryStore(), { signingKey })).app;
  try {
    assert.equal((await gated.inject({ method: 'GET', url: '/health' })).json().enrollment, 'token');
    assert.equal((await gated.inject({ method: 'POST', url: '/v1/devices/register', payload: payload() })).statusCode, 401);
    assert.equal((await open.inject({ method: 'GET', url: '/health' })).json().enrollment, 'open');
    const registered = await open.inject({ method: 'POST', url: '/v1/devices/register', payload: payload() });
    assert.equal(registered.statusCode, 201);
    assert.match(registered.json().deviceId, /^[1-9][0-9]{8}$/);
    // Older desktop versions always send a token; an open server ignores it.
    assert.equal((await open.inject({ method: 'POST', url: '/v1/devices/register', headers: { authorization: 'Bearer anything' }, payload: payload() })).statusCode, 201);
  } finally { await gated.close(); await open.close(); }
});
