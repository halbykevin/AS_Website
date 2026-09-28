# Architecture review — 2026-09-24

All 38 sections and the final product model were examined. The original plan remains unchanged as the product specification. This document records implementation decisions and unresolved delivery gates.

## Assessment

The Windows-only, attended remote-control scope and separation between rendezvous, transport, and interactive desktop processes are appropriate. Follow the specified build order: verified consent protocol, then data channels, TURN, capture, video, input, UI, service integration and release hardening. Building all three runtimes and capture at once would make failures difficult to isolate.

“Best practices” here means explicit authority, bounded resource use, tested failure handling, and a small operational footprint. This repository currently implements the first control-plane milestone, not the full desktop product.

## Review coverage and decisions

| Plan sections | Assessment and implementation decision |
| --- | --- |
| 1–3: product, UX, principles | Preserve attended access, one app in both roles, local visibility and disconnect. Consent is mandatory before signaling. |
| 4–5: stack and topology | Retain Fastify/TypeScript, PostgreSQL/Drizzle, future Tauri/React, Go/Pion and Rust helper. Video does not pass through Node. |
| 6–7: addressing and identity | Random nine-digit public IDs with DB uniqueness; canonical Ed25519 SPKI public keys; challenge signatures authenticate possession. Add administrator-authorized enrollment, missing from the plan. |
| 8–9: processes and Session 0 | Keep helper in logged-in session. Before production, specify Windows service identity, WTS session selection, named-pipe ACLs, peer process authentication, launch policy and disconnect on lock/logout. Never expose a general elevated command runner. |
| 10–11: connection and protocol | Normalize conflicting message examples into one versioned envelope. Server assigns request/session IDs and derives actor from socket authentication. The target may reduce requested permissions, never increase them. |
| 12–13: WebRTC and TURN | Preserve channel semantics and P2P-first routing. Authenticate peers against accepted session grants and bind session identity to DTLS fingerprints before input is enabled. Server authorization alone is not peer verification. Actual Pion/ICE/TURN testing remains a later gate. |
| 14–15: capture and encoding | DXGI and Media Foundation are suitable, but require explicit handling of access loss, resolution changes, cursor composition, adapter switching, NV12 conversion, H.264 profile/packetization and keyframe requests. Verify hardware and software encoders separately. |
| 16–17: input and clipboard | Use scan codes with layout tests; bound coordinates and payloads; enforce capability checks at native input boundary. Release held keys/buttons on every termination path. Clipboard is opt-in, text-only, size-limited with loop suppression. |
| 18: lifecycle | Server-owned terminal transitions. Requests expire after 30 seconds; negotiation grants expire after 60 seconds. Accepted sessions do not become connected until both peers report connectivity. No silent resume after server restart. |
| 19: security | One-use challenges and socket tickets, strict schemas, bounded queues, rate limits, signed grants, no client-embedded fleet password. Enrollment token is an administrative bootstrap credential and must not ship in clients. Production needs single-use enrollment tokens and key rotation/revocation operations. |
| 20–22: persistence and repository | Device, request, session and event tables; unique public keys; transactional lifecycle audit writes. One control-plane process with a database ownership lock. Distributed presence is explicitly deferred. |
| 23–25: deployment and domains | Private database network, API behind Caddy, TLS terminated at the edge. No public API or database container ports. TURN runs separately with explicit certificate provisioning. Docker/VPS deployment has not been exercised here. |
| 26–28: TURN, abuse and auditing | Session-membership checks before 10-minute HMAC-SHA1 coturn credentials. No public device directory, hostnames, SDP or ICE in audit. HTTP/IP and per-device/target request limits. Blocking, retention and operator tooling remain outstanding. |
| 29–30: releases | Signed updates and Authenticode remain release gates. Define manifest signing key, rollback prevention, atomic multi-binary update, service recovery and pinned trust before enabling updates. Signing certificates cannot be fabricated by the implementation. |
| 31–33: metrics, endpoints, messages | Health/readiness endpoints and metadata-only events implemented. TURN path reports are peer-reported telemetry, not server proof. Detailed operational metrics and signed update endpoint come with their respective features. |
| 34–38: build order, exclusions and readiness | Deliver a testable rendezvous milestone first. Do not describe it as remote desktop, production-ready, cross-network validated, or deployable fleet software yet. Retain delayed features, including unattended access and secure-desktop control. |

## Critical clarifications

1. A signed grant has a short **negotiation** lifetime. It is not a reusable bearer token. Future agents must validate signature, issuer, audience, participants, permissions, expiry and nonce, then bind it to the peer transport. The current server does not accept grants as HTTP or WebSocket authentication.
2. Active sessions have an eight-hour upper bound; transport loss terminates server authority. Future native agents must also stop input and capture locally when signaling authority disappears. A server notification alone cannot revoke an already established peer connection.
3. Controller playback is underspecified. The Go agent's received H.264 stream must reach the Tauri WebView through an explicit local media bridge or a native decoder/render surface. Do not assume a Go video track can be assigned directly to an HTML video element. Prototype this before committing the UI/media IPC contract.
4. In-memory presence requires one owner. Database persistence does not make a multi-instance WebSocket service safe. An advisory lock prevents accidental second ownership; restart closes old requests and sessions.
5. Production IP limiting behind Caddy currently shares the proxy's source IP. This is conservative but limits fleet throughput. Configure a narrowly trusted proxy CIDR before scaling; never blindly trust forwarded headers.

## Next acceptance gates

- Exercise migration, persistence, crash recovery and backup restore against PostgreSQL 17.
- Implement Go/Pion data channels and grant verification; test broadband-to-hotspot and forced relay.
- Prototype DXGI → Media Foundation → H.264 locally, including access-loss recovery.
- Resolve viewer rendering, then stream video and only then enable consent-scoped mouse/keyboard.
- Add visible Tauri UI, authenticated named pipes, service lifecycle, Windows secure key storage, blocking and revocation.
- Test signed updates, Authenticode installer, rollback, observability and external security review before broad internal distribution.

Implementation references: [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/), [Fastify WebSocket plugin](https://github.com/fastify/fastify-websocket), [Node cryptography](https://nodejs.org/api/crypto.html).
