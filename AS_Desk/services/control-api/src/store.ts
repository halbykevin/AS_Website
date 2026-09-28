export interface Device {
  id: string;
  publicId: string;
  publicKey: string;
  platform: 'windows';
  agentVersion: string;
  revokedAt: Date | null;
}
export interface AuditEvent {
  id: string;
  type: string;
  at: number;
  actor: string;
  requestId?: string;
  sessionId?: string;
  target?: string;
  reason?: string;
}
export interface Store {
  register(publicKey: string, agentVersion: string): Promise<Device>;
  find(publicId: string): Promise<Device | undefined>;
  seen(publicId: string): Promise<void>;
  audit(event: AuditEvent): Promise<void>;
  ready(): Promise<void>;
  close(): Promise<void>;
}
