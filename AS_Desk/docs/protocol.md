# Protocol v1

`packages/protocol/src/index.ts` is the canonical client-message schema. All live messages use:

```json
{
  "protocolVersion": 1,
  "id": "7bc5f678-3201-41d3-9ef5-eab5e46e112b",
  "timestamp": 1800000000000,
  "payload": { "type": "connection.request", "targetId": "123456789", "permissions": ["screen"] }
}
```

The server rejects extra fields, stale timestamps (over 30 seconds), repeated IDs on a connection, oversized payloads and unauthorized transitions. Clients should keep clocks synchronized. IDs are allocated by the server for requests and sessions.

1. An administrator authorizes `POST /v1/devices/register` using the enrollment bearer token. Send `publicKey` (canonical Ed25519 SPKI DER in base64), `platform: "windows"` and `agentVersion`. Repeat enrollment with the same key returns the same ID.
2. `POST /v1/devices/auth/challenge` with `deviceId` returns `challengeId`, a domain-separated UTF-8 `message` and millisecond expiry. Sign the exact message with Ed25519.
3. `POST /v1/devices/auth/verify` with `challengeId` and base64 signature returns a five-minute bearer `accessToken`. Every verification attempt consumes the challenge.
4. Authenticated `POST /v1/ws-ticket` returns a 15-second, single-use ticket. Connect to `/ws` with protocols `company-remote.v1, ticket.<ticket>`. Do not place credentials in URLs. The server selects only `company-remote.v1`. Browser-origin upgrades are rejected; the future desktop UI communicates through native IPC.
5. `connection.request` sends target and permissions; source identity is taken from the connection. Target receives `connection.incoming`; caller receives `connection.pending`.
6. Target sends `connection.accept` with request ID and a subset of requested permissions, or `connection.reject`. Controller may send `connection.cancel`. Each device may participate in only one pending request or session.
7. On acceptance both receive `connection.accepted`, including participant IDs, capabilities, session ID and signed grant. Controller may offer; target may answer; either may trickle ICE after the offer. Strangers and expired sessions cannot signal.
8. `POST /v1/turn/credentials` requires an authenticated session participant and `{ "sessionId": "..." }`. Returns short-lived coturn credentials only when TURN is configured.
9. Both peers report `session.connected` after transport establishment. Either sends `session.end` to terminate. Signaling disconnect, revocation detection or expiry ends authority; native agents must implement the corresponding local stop.

Grant format is `base64url(JSON claims).base64url(Ed25519 signature of first segment)`. It is deliberately not JWT. Claims include issuer, audience, participants, capabilities, session ID, issued-at, expiry in seconds and nonce. The development client stores the enrollment response's verification key; future production clients must pin that key through a trusted installer or authenticated provisioning.

Revocation is checked for REST authentication, upgrade tickets and every 15-second connection heartbeat. Requests and grants have separate timeouts; an established session has an eight-hour upper bound. There is no silent reconnection into an existing session.
