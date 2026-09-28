import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, randomUUID, verify, createPublicKey } from 'node:crypto';
import { Auth, Grants } from '../src/auth.ts';
import { MAX_CONTROLLER_SESSIONS, Rendezvous } from '../src/rendezvous.ts';
import { envelope } from '../../../packages/protocol/src/index.ts';
import type { ClientMessage, ServerMessage } from '../../../packages/protocol/src/index.ts';
import { MemoryStore } from './memory-store.ts';

const keys = () => generateKeyPairSync('ed25519');
function fixture() {
  let time = 1800000000000;
  const store = new MemoryStore();
  const key = keys();
  const grants = new Grants(key.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
  const hub = new Rendezvous(store, grants, () => time);
  const messages = new Map<string, ServerMessage[]>();
  const peerIds = new Map<string, string>();
  const connect = async (id: string) => {
    const key = keys();
    store.devices.set(id, { id: randomUUID(), publicId: id, publicKey: key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), platform: 'windows', agentVersion: '0.1.0', revokedAt: null });
    const peerId = randomUUID(); peerIds.set(id, peerId); messages.set(id, []);
    await hub.connect(id, { id: peerId, send: m => messages.get(id)!.push(m), close() {} });
  };
  const send = (id: string, payload: ClientMessage) => hub.handle(id, peerIds.get(id)!, { protocolVersion: 1, id: randomUUID(), timestamp: time, payload });
  const last = (id: string) => messages.get(id)!.at(-1)!;
  const request = async () => {
    await send('111111111', { type: 'connection.request', targetId: '222222222', permissions: ['screen', 'mouse'] });
    return last('222222222').requestId as string;
  };
  return { store, grants, hub, messages, peerIds, connect, send, last, request, advance: (ms: number) => { time += ms; } };
}
test('Ed25519 authentication consumes challenges on success and failure; tokens, tickets and revocation expire authority', async () => {
  let time = 1800000000000;
  const store = new MemoryStore();
  const key = keys();
  const device = await store.register(key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), '0.1.0');
  const auth = new Auth(store, () => time);
  const challenge = await auth.challenge(device.publicId);
  const signature = sign(null, Buffer.from(challenge.message), key.privateKey).toString('base64');
  const token = await auth.verify(challenge.challengeId, signature);
  await assert.rejects(auth.verify(challenge.challengeId, signature), /authentication_failed/);
  assert.equal((await auth.authenticate(token.accessToken)).publicId, device.publicId);
  const ticket = auth.ticket(device);
  await auth.consumeTicket(ticket.ticket);
  await assert.rejects(auth.consumeTicket(ticket.ticket), /authentication_required/);
  const bad = await auth.challenge(device.publicId);
  await assert.rejects(auth.verify(bad.challengeId, Buffer.alloc(64).toString('base64')), /authentication_failed/);
  await assert.rejects(auth.verify(bad.challengeId, sign(null, Buffer.from(bad.message), key.privateKey).toString('base64')), /authentication_failed/);
  device.revokedAt = new Date();
  await assert.rejects(auth.authenticate(token.accessToken), /authentication_required/);
  device.revokedAt = null;
  time += 300001;
  await assert.rejects(auth.authenticate(token.accessToken), /authentication_required/);
});
test('consent is target-only, cannot escalate permissions, and produces a verifiable grant for both peers', async () => {
  const f = fixture(); await f.connect('111111111'); await f.connect('222222222'); await f.connect('333333333');
  const requestId = await f.request();
  await assert.rejects(f.send('333333333', { type: 'connection.accept', requestId, permissions: ['screen'] }), /forbidden/);
  await assert.rejects(f.send('111111111', { type: 'connection.accept', requestId, permissions: ['screen'] }), /forbidden/);
  await assert.rejects(f.send('222222222', { type: 'connection.accept', requestId, permissions: ['screen', 'keyboard'] }), /permission_escalation/);
  await f.send('222222222', { type: 'connection.accept', requestId, permissions: ['screen'] });
  assert.equal(f.last('111111111').sessionId, f.last('222222222').sessionId);
  const [data, signature] = (f.last('111111111').grant as string).split('.');
  assert.ok(verify(null, Buffer.from(data!), createPublicKey({ key: Buffer.from(f.grants.publicKey, 'base64'), format: 'der', type: 'spki' }), Buffer.from(signature!, 'base64url')));
  assert.deepEqual(JSON.parse(Buffer.from(data!, 'base64url').toString()).capabilities, ['screen']);
  await assert.rejects(f.send('222222222', { type: 'connection.accept', requestId, permissions: ['screen'] }), /request_unavailable/);
});
test('cancel, reject and timeout are terminal and restricted to the appropriate participant', async () => {
  for (const action of ['cancel', 'reject', 'expire'] as const) {
    const f = fixture(); await f.connect('111111111'); await f.connect('222222222');
    const requestId = await f.request();
    await assert.rejects(f.send('222222222', { type: 'connection.cancel', requestId }), /forbidden/);
    if (action === 'expire') { f.advance(60001); await f.hub.sweep(); }
    else await f.send(action === 'cancel' ? '111111111' : '222222222', { type: action === 'cancel' ? 'connection.cancel' : 'connection.reject', requestId });
    await assert.rejects(f.send('222222222', { type: 'connection.accept', requestId, permissions: ['screen'] }), /request_unavailable/);
  }
});
test('signaling requires acceptance, correct role, membership and offer/answer order', async () => {
  const f = fixture(); await f.connect('111111111'); await f.connect('222222222'); await f.connect('333333333');
  await assert.rejects(f.send('111111111', { type: 'webrtc.offer', sessionId: randomUUID(), sdp: 'offer' }), /session_unavailable/);
  const requestId = await f.request();
  await f.send('222222222', { type: 'connection.accept', requestId, permissions: ['screen'] });
  const sessionId = f.last('111111111').sessionId as string;
  await assert.rejects(f.send('333333333', { type: 'webrtc.offer', sessionId, sdp: 'offer' }), /session_unavailable/);
  await assert.rejects(f.send('222222222', { type: 'webrtc.answer', sessionId, sdp: 'answer' }), /invalid_transition/);
  await f.send('111111111', { type: 'webrtc.offer', sessionId, sdp: 'offer' });
  await f.send('222222222', { type: 'webrtc.answer', sessionId, sdp: 'answer' });
  await f.send('111111111', { type: 'session.connected', sessionId, connectionType: 'direct' });
  await f.send('222222222', { type: 'session.connected', sessionId, connectionType: 'direct' });
  f.advance(61000); await f.hub.sweep();
  assert.ok(f.hub.sessionFor('111111111', sessionId));
  await f.hub.disconnect('222222222', f.peerIds.get('222222222')!);
  assert.equal(f.last('111111111').type, 'session.ended');
  assert.throws(() => f.hub.sessionFor('111111111', sessionId), /session_unavailable/);
});
test('disconnect revokes a session even when audit storage is unavailable', async () => {
  const f = fixture(); await f.connect('111111111'); await f.connect('222222222');
  const requestId = await f.request();
  await f.send('222222222', { type: 'connection.accept', requestId, permissions: ['screen'] });
  const sessionId = f.last('111111111').sessionId as string;
  f.store.failAudit = true;
  await assert.rejects(f.hub.disconnect('222222222', f.peerIds.get('222222222')!));
  assert.throws(() => f.hub.sessionFor('111111111', sessionId));
});
test('audit failure cannot create an accepted session', async () => {
  const f = fixture(); await f.connect('111111111'); await f.connect('222222222');
  const requestId = await f.request(); f.store.failAudit = true;
  await assert.rejects(f.send('222222222', { type: 'connection.accept', requestId, permissions: ['screen'] }));
  assert.equal(f.last('111111111').type, 'connection.pending');
});
test('duplicate connections, stale messages and replays cannot replace an authenticated peer', async () => {
  const f = fixture(); await f.connect('111111111'); await f.connect('222222222');
  await assert.rejects(f.hub.connect('111111111', { id: 'replacement', send() {}, close() {} }), /already_connected/);
  const msg = { protocolVersion: 1 as const, id: randomUUID(), timestamp: 1800000000000,
    payload: { type: 'connection.request' as const, targetId: '222222222', permissions: ['screen' as const] } };
  await f.hub.handle('111111111', f.peerIds.get('111111111')!, msg);
  await assert.rejects(f.hub.handle('111111111', f.peerIds.get('111111111')!, msg), /replayed_message/);
  f.advance(31000);
  await assert.rejects(f.hub.handle('111111111', f.peerIds.get('111111111')!, { ...msg, id: randomUUID() }), /stale_message/);
});
test('strict validation rejects forged identities and duplicate capabilities', () => {
  const base = { protocolVersion: 1, id: randomUUID(), timestamp: Date.now(), payload: {
    type: 'connection.request', targetId: '222222222', permissions: ['screen'], sourceId: '333333333' } };
  assert.equal(envelope.safeParse(base).success, false);
  assert.equal(envelope.safeParse({ ...base, payload: { type: 'connection.request', targetId: '222222222', permissions: ['screen', 'screen'] } }).success, false);
});

test('request budgets bound ID probing and unsolicited target prompts', async () => {
  const f = fixture(); await f.connect('111111111');
  for (let i = 0; i < 10; i++) {
    await assert.rejects(f.send('111111111', { type: 'connection.request', targetId: String(200000000 + i), permissions: ['screen'] }), /target_unavailable/);
  }
  await assert.rejects(f.send('111111111', { type: 'connection.request', targetId: '222222222', permissions: ['screen'] }), /rate_limited/);
  f.advance(60001); await f.hub.sweep(); await f.connect('222222222');
  for (let i = 0; i < 5; i++) {
    const requestId = await f.request();
    await f.send('222222222', { type: 'connection.reject', requestId });
  }
  await assert.rejects(f.request(), /rate_limited/);
});

test('negotiation expiry removes signaling and TURN authority', async () => {
  const f = fixture(); await f.connect('111111111'); await f.connect('222222222');
  const requestId = await f.request();
  await f.send('222222222', { type: 'connection.accept', requestId, permissions: ['screen'] });
  const sessionId = f.last('111111111').sessionId as string;
  f.advance(60001); await f.hub.sweep();
  assert.equal(f.last('111111111').reason, 'negotiation_timeout');
  assert.throws(() => f.hub.sessionFor('111111111', sessionId), /session_unavailable/);
});

test('expired authentication challenges and upgrade tickets cannot be consumed', async () => {
  let time = 1800000000000;
  const store = new MemoryStore(); const key = keys();
  const device = await store.register(key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), '0.1.0');
  const auth = new Auth(store, () => time);
  const challenge = await auth.challenge(device.publicId);
  const ticket = auth.ticket(device);
  time += 30001;
  await assert.rejects(auth.consumeTicket(ticket.ticket), /authentication_required/);
  await assert.rejects(auth.verify(challenge.challengeId, sign(null, Buffer.from(challenge.message), key.privateKey).toString('base64')), /authentication_failed/);
});

test('a technician runs several sessions at once; a computer being helped has one helper and controls no one', async () => {
  const f = fixture(); await f.connect('111111111'); await f.connect('999999999');
  const targets = Array.from({ length: MAX_CONTROLLER_SESSIONS + 1 }, (_, i) => String(200000001 + i));
  for (const t of targets) await f.connect(t);
  const sessions: string[] = [];
  for (const t of targets.slice(0, MAX_CONTROLLER_SESSIONS)) {
    await f.send('111111111', { type: 'connection.request', targetId: t, permissions: ['screen', 'mouse'] });
    const requestId = f.last(t).requestId as string;
    // Pending requests count towards the limit and do not block further requests.
    await f.send(t, { type: 'connection.accept', requestId, permissions: ['screen', 'mouse'] });
    sessions.push(f.last(t).sessionId as string);
    f.advance(7000); // stay inside the per-minute request budget
  }
  assert.equal(new Set(sessions).size, MAX_CONTROLLER_SESSIONS);
  await assert.rejects(f.send('111111111', { type: 'connection.request', targetId: targets.at(-1)!, permissions: ['screen'] }), /session_limit/);
  // One helper per target: a second technician cannot reach a computer that is already being helped.
  await assert.rejects(f.send('999999999', { type: 'connection.request', targetId: targets[0]!, permissions: ['screen'] }), /target_unavailable/);
  // A technician with sessions cannot be controlled, and a computer being helped cannot control others.
  await assert.rejects(f.send('999999999', { type: 'connection.request', targetId: '111111111', permissions: ['screen'] }), /target_unavailable/);
  await assert.rejects(f.send(targets[0]!, { type: 'connection.request', targetId: '999999999', permissions: ['screen'] }), /device_busy/);
  // Sessions are independent: ending one leaves the others, and frees a slot.
  await f.send('111111111', { type: 'session.end', sessionId: sessions[0]! });
  assert.equal(f.last('111111111').type, 'session.ended');
  await f.send('111111111', { type: 'connection.request', targetId: targets.at(-1)!, permissions: ['screen'] });
  assert.equal(f.last(targets.at(-1)!).type, 'connection.incoming');
  await assert.rejects(f.send(targets[1]!, { type: 'webrtc.offer', sessionId: sessions[1]!, sdp: 'v=0' }), /invalid_transition/);
  await f.send('111111111', { type: 'webrtc.offer', sessionId: sessions[1]!, sdp: 'v=0' });
  assert.equal(f.last(targets[1]!).type, 'webrtc.offer');
});
