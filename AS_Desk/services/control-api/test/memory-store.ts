import { randomInt, randomUUID } from 'node:crypto';
import type { AuditEvent, Device, Store } from '../src/store.ts';

export class MemoryStore implements Store {
  devices = new Map<string, Device>();
  events: AuditEvent[] = [];
  failAudit = false;
  async register(publicKey: string, agentVersion: string) {
    const existing = [...this.devices.values()].find(d => d.publicKey === publicKey);
    if (existing) return existing;
    let publicId: string;
    do { publicId = String(randomInt(100000000, 1000000000)); } while (this.devices.has(publicId));
    const device: Device = { id: randomUUID(), publicId, publicKey, platform: 'windows', agentVersion, revokedAt: null };
    this.devices.set(publicId, device);
    return device;
  }
  async find(id: string) { return this.devices.get(id); }
  async seen() {}
  async audit(event: AuditEvent) { if (this.failAudit) throw new Error('Database unavailable'); this.events.push(event); }
  async ready() {}
  async close() {}
}
