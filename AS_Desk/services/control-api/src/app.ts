import Fastify, { LogController } from 'fastify';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { envelope, publicId, registration } from '../../../packages/protocol/src/index.ts';
import { Auth, DomainError, Grants, deviceKey, secretEqual } from './auth.ts';
import { Rendezvous } from './rendezvous.ts';
import type { Device, Store } from './store.ts';

export interface Config {
  /** Required to register a device. Undefined means open enrollment: anyone may register. */
  enrollmentToken?: string;
  signingKey: string;
  turnSecret?: string;
  turnUrls?: string[];
  trustProxy?: string;
  logger?: boolean;
  now?: () => number;
}
export async function buildApp(store: Store, config: Config) {
  if (config.enrollmentToken !== undefined && config.enrollmentToken.length < 32) throw new Error('ENROLLMENT_TOKEN must contain at least 32 characters');
  const now = config.now ?? Date.now;
  const app = Fastify({ logger: config.logger ? { redact: ['req.headers.authorization', 'req.headers.sec-websocket-protocol'] } : false,
    logController: new LogController({ disableRequestLogging: true }), bodyLimit: 8192, trustProxy: config.trustProxy ?? false });
  const grants = new Grants(config.signingKey);
  const auth = new Auth(store, now);
  const hub = new Rendezvous(store, grants, now);
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });
  await app.register(websocket, { options: { maxPayload: 65536, perMessageDeflate: false,
    handleProtocols: protocols => protocols.has('company-remote.v1') ? 'company-remote.v1' : false } });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) return reply.code(error.status).send({ error: error.code });
    if (error instanceof z.ZodError) return reply.code(400).send({ error: 'invalid_request' });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: status === 429 ? 'rate_limited' : 'invalid_request' });
    app.log.error({ event: 'request_failed' });
    return reply.code(503).send({ error: 'temporarily_unavailable' });
  });
  const bearer = (value?: string) => {
    if (!value?.startsWith('Bearer ')) throw new DomainError('authentication_required', 401);
    return value.slice(7);
  };
  app.get('/health', async () => ({ status: 'ok', protocolVersion: 1, enrollment: config.enrollmentToken === undefined ? 'open' : 'token' }));
  app.get('/ready', async () => { await store.ready(); return { status: 'ready' }; });
  app.post('/v1/devices/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (config.enrollmentToken !== undefined && !secretEqual(bearer(req.headers.authorization), config.enrollmentToken)) throw new DomainError('forbidden', 403);
    const body = registration.parse(req.body);
    deviceKey(body.publicKey);
    const device = await store.register(body.publicKey, body.agentVersion);
    if (device.revokedAt) throw new DomainError('forbidden', 403);
    return reply.code(201).send({ deviceId: device.publicId, signingPublicKey: grants.publicKey });
  });
  app.post('/v1/devices/auth/challenge', async req => {
    const body = z.strictObject({ deviceId: publicId }).parse(req.body);
    return auth.challenge(body.deviceId);
  });
  app.post('/v1/devices/auth/verify', async req => {
    const body = z.strictObject({ challengeId: z.string().uuid(), signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/) }).parse(req.body);
    return auth.verify(body.challengeId, body.signature);
  });
  app.post('/v1/ws-ticket', async req => auth.ticket(await auth.authenticate(bearer(req.headers.authorization))));
  app.post('/v1/turn/credentials', async req => {
    const device = await auth.authenticate(bearer(req.headers.authorization));
    const body = z.strictObject({ sessionId: z.string().uuid() }).parse(req.body);
    await hub.serial(async () => { hub.sessionFor(device.publicId, body.sessionId); });
    if (!config.turnSecret || !config.turnUrls?.length) throw new DomainError('turn_not_configured', 503);
    const expiresAt = Math.floor(now() / 1000) + 600;
    const username = `${expiresAt}:${device.publicId}`;
    const credential = createHmac('sha1', config.turnSecret).update(username).digest('base64');
    return { iceServers: [{ urls: config.turnUrls, username, credential }], expiresAt };
  });
  const upgrades = new WeakMap<object, Device>();
  app.get('/ws', { websocket: true, preValidation: async req => {
    // Agents use native sockets. Reject browser-origin upgrades rather than expose a local UI trust bypass.
    if (req.headers.origin) throw new DomainError('forbidden_origin', 403);
    const protocols = req.headers['sec-websocket-protocol']?.split(',').map(p => p.trim()) ?? [];
    const ticket = protocols.find(p => p.startsWith('ticket.'))?.slice(7);
    if (!protocols.includes('company-remote.v1') || !ticket) throw new DomainError('authentication_required', 401);
    upgrades.set(req, await auth.consumeTicket(ticket));
  } }, (socket, req) => {
    const device = upgrades.get(req)!;
    upgrades.delete(req);
    const peerId = randomUUID();
    let pending = 0;
    let alive = true;
    const send = (message: Record<string, unknown>) => {
      if (socket.readyState !== socket.OPEN) return;
      if (socket.bufferedAmount > 262144) { socket.terminate(); return; }
      socket.send(JSON.stringify({ protocolVersion: 1, id: randomUUID(), timestamp: now(), payload: message }));
    };
    const fail = (error: unknown, correlationId?: string) => {
      send({ type: 'error', code: error instanceof DomainError ? error.code : 'temporarily_unavailable', ...(correlationId ? { correlationId } : {}) });
      if (!(error instanceof DomainError)) { app.log.error({ event: 'session_transition_failed' }); socket.close(1011, 'Service unavailable'); }
    };
    void hub.serial(() => hub.connect(device.publicId, { id: peerId, send, close: () => socket.close(1001, 'Server shutdown') }))
      .catch(error => { fail(error); socket.close(1008, 'Connection refused'); });
    socket.on('message', (raw, binary) => {
      if (binary || ++pending > 16) { socket.close(1008, 'Invalid traffic'); return; }
      let parsed;
      try { parsed = envelope.parse(JSON.parse(raw.toString())); }
      catch { pending--; send({ type: 'error', code: 'invalid_message' }); socket.close(1008, 'Invalid message'); return; }
      const message = parsed;
      void hub.serial(async () => {
        if (socket.readyState === socket.OPEN) await hub.handle(device.publicId, peerId, message);
      }).catch(error => fail(error, message.id)).finally(() => pending--);
    });
    socket.on('pong', () => { alive = true; });
    let checkingIdentity = false;
    const heartbeat = setInterval(() => {
      if (!alive) { socket.terminate(); return; }
      alive = false; socket.ping();
      if (checkingIdentity) return;
      checkingIdentity = true;
      void store.find(device.publicId).then(current => {
        if (!current || current.revokedAt) socket.close(1008, 'Identity revoked');
      }).catch(() => socket.close(1011, 'Identity unavailable')).finally(() => { checkingIdentity = false; });
    }, 15000);
    heartbeat.unref();
    socket.on('error', () => { socket.terminate(); });
    socket.on('close', () => {
      clearInterval(heartbeat);
      void hub.serial(() => hub.disconnect(device.publicId, peerId)).catch(() => app.log.error({ event: 'disconnect_audit_failed' }));
    });
  });
  let sweeping = false;
  const timer = setInterval(() => {
    auth.sweep();
    if (sweeping) return;
    sweeping = true;
    void hub.serial(() => hub.sweep()).catch(() => app.log.error({ event: 'expiry_audit_failed' })).finally(() => { sweeping = false; });
  }, 1000);
  timer.unref();
  app.addHook('preClose', async () => { clearInterval(timer); hub.close(); });
  app.addHook('onClose', async () => { await hub.serial(async () => undefined); await store.close(); });
  return { app, hub, auth };
}
