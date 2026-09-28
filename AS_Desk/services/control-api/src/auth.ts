import { createPublicKey, createPrivateKey, randomBytes, randomUUID, sign, verify, timingSafeEqual } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import type { Store, Device } from './store.ts';

export class DomainError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export function secretEqual(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function deviceKey(encoded: string): KeyObject {
  try {
    const key = createPublicKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error();
    if (key.export({ format: 'der', type: 'spki' }).toString('base64') !== encoded) throw new Error();
    return key;
  } catch { throw new DomainError('invalid_public_key'); }
}
export class Grants {
  private key: KeyObject;
  readonly publicKey: string;
  constructor(pem: string) {
    this.key = createPrivateKey(pem);
    if (this.key.asymmetricKeyType !== 'ed25519') throw new Error('Session key must be Ed25519');
    this.publicKey = createPublicKey(this.key).export({ type: 'spki', format: 'der' }).toString('base64');
  }
  issue(claims: Record<string, unknown>): string {
    const data = Buffer.from(JSON.stringify({ iss: 'company-remote', aud: 'company-remote-agent', ...claims })).toString('base64url');
    return `${data}.${sign(null, Buffer.from(data), this.key).toString('base64url')}`;
  }
}
type Challenge = { deviceId: string; message: string; expiresAt: number };
type Token = { deviceId: string; expiresAt: number };
export class Auth {
  private challenges = new Map<string, Challenge>();
  private tokens = new Map<string, Token>();
  private tickets = new Map<string, Token>();
  constructor(private store: Store, private now = Date.now) {}
  sweep() {
    for (const map of [this.challenges, this.tokens, this.tickets]) {
      for (const [id, value] of map) if (value.expiresAt <= this.now()) map.delete(id);
    }
  }
  async challenge(deviceId: string) {
    this.sweep();
    if (this.challenges.size >= 10000) throw new DomainError('busy', 503);
    // Identical response shape even for unknown IDs; verification resolves identity.
    const id = randomUUID();
    const expiresAt = this.now() + 30000;
    const message = `company-remote:device-auth:v1:${deviceId}:${id}:${randomBytes(32).toString('base64url')}`;
    this.challenges.set(id, { deviceId, message, expiresAt });
    return { challengeId: id, message, expiresAt };
  }
  async verify(challengeId: string, signature: string) {
    const challenge = this.challenges.get(challengeId);
    this.challenges.delete(challengeId); // consume before any await, including failed attempts
    if (!challenge || challenge.expiresAt <= this.now()) throw new DomainError('authentication_failed', 401);
    const device = await this.store.find(challenge.deviceId);
    if (!device || device.revokedAt || !verify(null, Buffer.from(challenge.message), deviceKey(device.publicKey), Buffer.from(signature, 'base64')))
      throw new DomainError('authentication_failed', 401);
    await this.store.seen(device.publicId);
    this.sweep();
    if (this.tokens.size >= 10000) throw new DomainError('busy', 503);
    const accessToken = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + 300000;
    this.tokens.set(accessToken, { deviceId: device.publicId, expiresAt });
    return { accessToken, expiresAt };
  }
  async authenticate(token: string): Promise<Device> {
    const entry = this.tokens.get(token);
    if (!entry || entry.expiresAt <= this.now()) throw new DomainError('authentication_required', 401);
    const device = await this.store.find(entry.deviceId);
    if (!device || device.revokedAt) throw new DomainError('authentication_required', 401);
    return device;
  }
  ticket(device: Device) {
    this.sweep();
    if (this.tickets.size >= 10000) throw new DomainError('busy', 503);
    const ticket = randomBytes(32).toString('base64url');
    this.tickets.set(ticket, { deviceId: device.publicId, expiresAt: this.now() + 15000 });
    return { ticket };
  }
  async consumeTicket(ticket: string): Promise<Device> {
    const entry = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!entry || entry.expiresAt <= this.now()) throw new DomainError('authentication_required', 401);
    const device = await this.store.find(entry.deviceId);
    if (!device || device.revokedAt) throw new DomainError('authentication_required', 401);
    return device;
  }
}
