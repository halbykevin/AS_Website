import { z } from 'zod';

export const publicId = z.string().regex(/^[1-9][0-9]{8}$/);
export const capability = z.enum(['screen', 'mouse', 'keyboard', 'clipboard']);
export const capabilities = z.array(capability).min(1).max(4)
  .refine(v => new Set(v).size === v.length, 'Duplicate capabilities')
  .refine(v => v.includes('screen'), 'Screen permission required');
export type Capability = z.infer<typeof capability>;
const requestId = z.string().uuid();
const sessionId = z.string().uuid();
export const clientMessage = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('connection.request'), targetId: publicId, permissions: capabilities }),
  z.strictObject({ type: z.literal('connection.accept'), requestId, permissions: capabilities }),
  z.strictObject({ type: z.literal('connection.reject'), requestId }),
  z.strictObject({ type: z.literal('connection.cancel'), requestId }),
  z.strictObject({ type: z.literal('session.end'), sessionId }),
  z.strictObject({ type: z.literal('session.connected'), sessionId,
    connectionType: z.enum(['direct', 'turn_udp', 'turn_tcp', 'turn_tls']) }),
  z.strictObject({ type: z.literal('webrtc.offer'), sessionId, sdp: z.string().min(1).max(49152), signature: z.string().max(128).optional() }),
  z.strictObject({ type: z.literal('webrtc.answer'), sessionId, sdp: z.string().min(1).max(49152), signature: z.string().max(128).optional() }),
  z.strictObject({ type: z.literal('webrtc.ice'), sessionId, candidate: z.strictObject({
    candidate: z.string().max(2048), sdpMid: z.string().max(64).nullable(),
    sdpMLineIndex: z.number().int().min(0).max(32).nullable()
  }) })
]);
export type ClientMessage = z.infer<typeof clientMessage>;
export const envelope = z.strictObject({
  protocolVersion: z.literal(1), id: z.string().uuid(), timestamp: z.number().int().positive(),
  payload: clientMessage
});
export type Envelope = z.infer<typeof envelope>;
export type ServerMessage = { type: string; [key: string]: unknown };
export const registration = z.strictObject({
  publicKey: z.string().min(32).max(256),
  platform: z.literal('windows'), agentVersion: z.string().regex(/^\d+\.\d+\.\d+$/).max(32)
});
