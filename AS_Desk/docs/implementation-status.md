# Delivery status

## Implemented

- Strict TypeScript monorepo foundation and versioned Zod protocol.
- Fastify API/WebSocket control plane; PostgreSQL/Drizzle device repository and
  ordered, transactional SQL migrations.
- Random stable IDs, unique device keys, administrator-gated enrollment.
- Ed25519 challenge authentication, expiring access tokens, one-use WebSocket
  tickets.
- Presence, request/accept/reject/cancel/timeout, narrowed consent permissions,
  signed grants.
- Participant- and role-checked SDP/ICE forwarding; session lifecycle, heartbeat
  and disconnect cleanup.
- Session-scoped TURN credential issuance; per-client HTTP limits behind a
  trusted local proxy, device/target limits and bounded payloads/queues.
- Metadata-only durable lifecycle audit, device last-seen tracking,
  single-process ownership lock with restart handoff and restart cleanup.
- Operator CLI: list, revoke and restore devices; recent sessions; summary.
- Open or token-gated enrollment (`ENROLLMENT_MODE`); installed apps register
  themselves on first launch and retry while offline.
- Tauri 2 desktop app (1.6 MB installer): Rust core with the identity (DPAPI),
  signaling, consent and input; WebView2 UI limited to an allow-listed set of
  commands; restrictive CSP. Upgrades from the Electron 0.3–0.5 versions keep
  the computer's ID.
- Tray residency, start with Windows (`--hidden`), incoming-request
  notification, compact always-on-top sharing panel excluded from capture,
  maximized viewer with full screen.
- Server-clock offset for message timestamps, grant validation and request
  deadlines, so skewed client clocks work.
- Chromium desktop capture, H.264-preferred WebRTC video, encrypted
  DataChannels, clipboard sync, adaptive stats and signed SDP/DTLS-fingerprint
  binding.
- In-process `SendInput`: per-monitor DPI aware, scan-code keyboard input,
  normalized mouse input on the shared display (identified from the captured
  screen and verified by the E2E suite), held-input release; input refused by
  Windows (UAC, elevated windows) does not end the session.
- Unattended access (AnyDesk-style): a password set on the computer to be
  reached lets an authorised controller in without anyone there approving. The
  target stores only an Argon2id verifier (DPAPI-protected); proof travels
  peer-to-peer through the rendezvous as an opaque, replay-bound HMAC
  challenge-response, so the server never sees the password. An accepted
  unattended request runs the same capture+consent path as the Accept button,
  keeps the visible sharing indicator, tray and `Ctrl+Alt+Shift+F12`, and
  reaches elevated apps/UAC through the SYSTEM helper. The controller can
  remember the password per computer (DPAPI). Repeated wrong proofs lock out
  further attempts.
- Production deployment on asdesk-api.raiapp.dev: nginx + Let's Encrypt,
  PostgreSQL, coturn (UDP/TCP/TLS), sandboxed systemd service, nightly and
  pre-migration backups, atomic releases with health-checked automatic rollback,
  installer downloads.
- Tests: server security/integration, PostgreSQL integration (via
  `npm run server:smoke`), bundled-release smoke test, Rust core unit tests
  (including interop fixtures from the server code), two-instance Tauri E2E
  locally and against the deployed server through the TURN relay.

## Not implemented yet

1. Automatic desktop updates. New versions are installed over the old one; the
   device identity is kept.
2. Authenticode signing: the installer is unsigned, so SmartScreen warns on
   first run. `npm run desktop:release` refuses to build without a certificate.
3. Secure-desktop _capture_: input reaches the secure desktop (UAC, lock screen)
   through the SYSTEM helper, and unattended access is implemented (above), but
   the WebView2 screen capture cannot see the secure desktop, so the lock screen
   shows black until it is unlocked (the controller can still type the password
   blind). Ctrl+Alt+Del from the controller is not yet sent.
4. Single-use enrollment tokens and audit retention. Production enrollment is
   open (installed apps register themselves); in `token` mode the token is
   shared and rotated by editing the server `.env`.
5. TURN over TCP 443 for networks that block everything else (nginx owns 443 on
   the shared host), multi-monitor switching during a session, file transfer and
   audio.

## Verification boundaries

Verified on 2026-09-25 with the Tauri app: enrollment, authentication, WebSocket
signaling, consent, H.264 video and data channels between two app instances on
one Windows PC through the production server, with media forced through the TURN
relay (UDP), and TURN TLS on 5349. Two physical computers on different networks,
direct peer-to-peer across NATs, and real `SendInput` injection on a high-DPI
display have not been exercised by automation here; the E2E uses a dry-run
injector. The upgrade from an installed Electron version was verified on a copy
of a real 0.4 identity; the installer's removal of the old version has not been
run on a test machine yet.
