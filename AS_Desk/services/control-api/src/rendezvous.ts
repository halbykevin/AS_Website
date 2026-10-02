import { randomUUID } from "node:crypto";
import type { Capability, Envelope, ServerMessage } from "../../../packages/protocol/src/index.ts";
import { DomainError, Grants } from "./auth.ts";
import type { AuditEvent, Store } from "./store.ts";

type Peer = { id: string; send(message: ServerMessage): void; close(): void };
// Long enough to read the request and choose a screen in Windows' picker on the target computer.
const REQUEST_TTL = 60000;
// Helpdesk policy: a technician's computer may run several sessions at once (pending requests count
// towards the limit); a computer being helped has one helper at a time and does not control others.
export const MAX_CONTROLLER_SESSIONS = 8;
type Request = { id: string; controller: string; target: string; permissions: Capability[]; expiresAt: number };
type Session = Request & { requestId: string; phase: "accepted" | "offered" | "answered" | "connected"; connected: Set<string> };
export class Rendezvous {
  private peers = new Map<string, Peer>();
  private requests = new Map<string, Request>();
  private sessions = new Map<string, Session>();
  private replay = new Map<string, Map<string, number>>();
  private budgets = new Map<string, { count: number; reset: number }>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private store: Store,
    private grants: Grants,
    private now = Date.now
  ) {}
  // All lifecycle transitions, including disconnect and timeout, share one serialization boundary.
  serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private emit(id: string, message: ServerMessage) {
    this.peers.get(id)?.send(message);
  }
  private both(r: Request, message: ServerMessage) {
    this.emit(r.controller, message);
    this.emit(r.target, message);
  }
  private async audit(event: Omit<AuditEvent, "id" | "at">) {
    await this.store.audit({ id: randomUUID(), at: this.now(), ...event });
  }
  private budget(key: string, limit: number) {
    const now = this.now();
    let entry = this.budgets.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + 60000 };
      this.budgets.set(key, entry);
    }
    if (++entry.count > limit) throw new DomainError("rate_limited", 429);
  }
  private all() {
    return [...this.requests.values(), ...this.sessions.values()];
  }
  /** Involved in any request or session, in either role: cannot be controlled. */
  private busy(id: string): boolean {
    return this.all().some(r => r.controller === id || r.target === id);
  }
  async connect(id: string, peer: Peer) {
    if (this.peers.has(id)) throw new DomainError("already_connected", 409);
    if (this.peers.size >= 5000) throw new DomainError("capacity", 503);
    this.peers.set(id, peer);
    this.replay.set(id, new Map());
    peer.send({ type: "device.online", deviceId: id, protocolVersion: 1 });
  }
  async disconnect(id: string, peerId: string) {
    if (this.peers.get(id)?.id !== peerId) return;
    this.peers.delete(id);
    this.replay.delete(id);
    // Revoke in-memory authority even if persistence is unavailable.
    for (const request of [...this.requests.values()]) {
      if (request.controller === id || request.target === id) {
        this.requests.delete(request.id);
        this.both(request, { type: "connection.cancelled", requestId: request.id, reason: "peer_disconnected" });
        await this.audit({ type: "request.cancelled", actor: id, requestId: request.id, reason: "peer_disconnected" });
      }
    }
    for (const session of [...this.sessions.values()]) {
      if (session.controller === id || session.target === id) await this.end(session, id, "peer_disconnected");
    }
  }
  async sweep() {
    const now = this.now();
    for (const [key, budget] of this.budgets) if (budget.reset <= now) this.budgets.delete(key);
    for (const ids of this.replay.values()) for (const [key, expiry] of ids) if (expiry <= now) ids.delete(key);
    for (const request of [...this.requests.values()])
      if (request.expiresAt <= now) {
        this.requests.delete(request.id);
        this.both(request, { type: "connection.expired", requestId: request.id });
        await this.audit({ type: "request.expired", actor: request.target, requestId: request.id });
      }
    for (const session of [...this.sessions.values()]) if (session.expiresAt <= now) await this.end(session, session.target, session.phase === "connected" ? "session_limit" : "negotiation_timeout");
  }
  private async end(session: Session, actor: string, reason: string) {
    this.sessions.delete(session.id);
    this.both(session, { type: "session.ended", sessionId: session.id, reason });
    await this.audit({ type: "session.ended", actor, sessionId: session.id, reason });
  }
  sessionFor(id: string, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAt <= this.now() || (session.controller !== id && session.target !== id)) throw new DomainError("session_unavailable", 403);
    return session;
  }
  async handle(id: string, peerId: string, message: Envelope) {
    if (this.peers.get(id)?.id !== peerId) throw new DomainError("stale_connection", 403);
    this.budget(`messages:${id}`, 600);
    if (Math.abs(this.now() - message.timestamp) > 30000) throw new DomainError("stale_message");
    const seen = this.replay.get(id)!;
    if (seen.has(message.id)) throw new DomainError("replayed_message");
    seen.set(message.id, this.now() + 60000);
    const m = message.payload;
    if (m.type === "connection.request") {
      this.budget(`source:${id}`, 10);
      this.budget(`target:${m.targetId}`, 5);
      if (id === m.targetId) throw new DomainError("self_connection");
      if (!this.peers.has(m.targetId) || this.busy(m.targetId)) throw new DomainError("target_unavailable");
      if (this.all().some(r => r.target === id)) throw new DomainError("device_busy");
      if (this.all().filter(r => r.controller === id).length >= MAX_CONTROLLER_SESSIONS) throw new DomainError("session_limit", 429);
      const r: Request = { id: randomUUID(), controller: id, target: m.targetId, permissions: m.permissions, expiresAt: this.now() + REQUEST_TTL };
      await this.audit({ type: "request.created", actor: id, target: r.target, requestId: r.id });
      this.requests.set(r.id, r);
      this.emit(id, { type: "connection.pending", requestId: r.id, targetId: r.target, expiresAt: r.expiresAt });
      this.emit(r.target, { type: "connection.incoming", requestId: r.id, sourceId: id, permissions: r.permissions, expiresAt: r.expiresAt });
      return;
    }
    if ("requestId" in m) {
      const r = this.requests.get(m.requestId);
      if (!r || r.expiresAt <= this.now()) throw new DomainError("request_unavailable");
      // Unattended authentication is relayed opaquely between the request's two parties: the target
      // (holder of the verifier) challenges, the controller proves. The server never inspects or
      // stores the password material; it only forwards it to the correct peer, once per direction.
      if (m.type === "connection.challenge" || m.type === "connection.prove") {
        const fromTarget = m.type === "connection.challenge";
        if (id !== (fromTarget ? r.target : r.controller)) throw new DomainError("forbidden", 403);
        if (!fromTarget) this.budget(`prove:${r.target}`, 10);
        this.emit(fromTarget ? r.controller : r.target, m);
        return;
      }
      const allowed = m.type === "connection.cancel" ? r.controller : r.target;
      if (id !== allowed) throw new DomainError("forbidden", 403);
      if (m.type === "connection.accept") {
        if (m.permissions.some(p => !r.permissions.includes(p))) throw new DomainError("permission_escalation", 403);
        const s: Session = { ...r, id: randomUUID(), requestId: r.id, permissions: m.permissions, expiresAt: this.now() + 60000, phase: "accepted", connected: new Set() };
        const controller = await this.store.find(s.controller);
        const target = await this.store.find(s.target);
        if (!controller || !target || controller.revokedAt || target.revokedAt) throw new DomainError("identity_unavailable");
        const grant = this.grants.issue({ sessionId: s.id, controllerDeviceId: s.controller, controllerPublicKey: controller.publicKey, targetPublicKey: target.publicKey, targetDeviceId: s.target, capabilities: s.permissions, exp: Math.floor(s.expiresAt / 1000), iat: Math.floor(this.now() / 1000), nonce: randomUUID() });
        await this.audit({ type: "request.accepted", actor: id, target: r.controller, requestId: r.id, sessionId: s.id });
        this.requests.delete(r.id);
        this.sessions.set(s.id, s);
        this.both(s, { type: "connection.accepted", requestId: r.id, sessionId: s.id, controllerId: s.controller, targetId: s.target, permissions: s.permissions, grant, expiresAt: s.expiresAt });
      } else {
        const status = m.type === "connection.reject" ? "rejected" : "cancelled";
        await this.audit({ type: `request.${status}`, actor: id, requestId: r.id });
        this.requests.delete(r.id);
        this.both(r, { type: `connection.${status}`, requestId: r.id });
      }
      return;
    }
    const s = this.sessionFor(id, m.sessionId);
    const other = s.controller === id ? s.target : s.controller;
    switch (m.type) {
      case "session.end":
        await this.end(s, id, "user_disconnect");
        return;
      case "webrtc.offer":
        if (s.controller !== id || s.phase !== "accepted") throw new DomainError("invalid_transition");
        s.phase = "offered";
        break;
      case "webrtc.answer":
        if (s.target !== id || s.phase !== "offered") throw new DomainError("invalid_transition");
        s.phase = "answered";
        break;
      case "webrtc.ice":
        if (s.phase === "accepted") throw new DomainError("invalid_transition");
        break;
      case "session.connected":
        if (s.phase !== "answered" && s.phase !== "connected") throw new DomainError("invalid_transition");
        if (s.connected.has(id)) return;
        await this.audit({ type: "session.peer_connected", actor: id, sessionId: s.id, reason: m.connectionType });
        s.connected.add(id);
        if (s.connected.size === 2) {
          await this.audit({ type: "session.connected", actor: id, sessionId: s.id });
          s.phase = "connected";
          s.expiresAt = this.now() + 8 * 60 * 60 * 1000;
        }
        break;
    }
    this.emit(other, m);
  }
  close() {
    for (const peer of this.peers.values()) peer.close();
  }
}
