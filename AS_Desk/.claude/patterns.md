# Codebase patterns

Established 2026-09-24; deployment added 2026-09-25.

- Node 22.12+, strict TypeScript ESM, explicit `.ts` imports; npm lockfile.
- Runtime protocol validation in `packages/protocol/src/index.ts` with Zod.
- Fastify HTTP/WS adapters call independent auth and rendezvous modules.
- PostgreSQL + Drizzle for durable devices; numbered, additive SQL migrations (`NNN_name.sql`) applied in one transaction by `migrate.ts`.
- Memory storage is a test dependency, never the production default.
- Tests use Node's test runner and real loopback WebSocket clients.
- No device secrets, SDP, ICE, input, or clipboard content in logs/audits.
- Single control-plane process. Serialize session transitions and persist audit before publishing changes.
- The server ships as esbuild bundles (`tools/build-server.mjs`); the host needs only Node, no `node_modules`.
- Operations go through `deploy/asdesk.sh` (`npm run server:*`): host profiles in gitignored `deploy/.env.vps*`, key-based SSH with a pinned host key, remote scripts in `deploy/remote/` uploaded on every run, templates rendered with `@TOKEN@` placeholders. Remote steps are idempotent and only touch `asdesk*` resources on the shared host.
- Desktop main/preload/UI are bundled; the renderer reaches the main process only through the typed preload API.
- Public website lives in `apps/website`: Vite + React + TypeScript + Tailwind v4, TanStack Query for the release manifest,
  Redux Toolkit for small UI preferences, and static `public/releases.json` as the release source of truth.
- Website installer publishing is handled by `npm run website:publish -- --version <x.y.z>`; it validates the matching
  Windows 7 x64/x86 files in `release/`, points the manifest at the configured download base, and supports `--copy` for
  a self-contained static deployment.
