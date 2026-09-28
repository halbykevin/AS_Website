# Server deployment and operations

The control server runs on a shared Ubuntu host next to other applications. It uses what the
host already has — nginx with certbot, PostgreSQL, Node — and adds coturn for the TURN relay.
Everything is driven from a developer machine with `npm run server:*`, modeled on the as-punch
deploy flow: a host profile, a tarball, a remote script, an atomic switch and a health check that
rolls back automatically.

```text
Windows PC ──HTTPS/WSS──> nginx :443 ──> asdesk-api 127.0.0.1:4700 ──> PostgreSQL (asdesk db)
     │                         └─ /downloads/  installers
     └──STUN/TURN──> coturn :3478 udp/tcp, :5349 tls, relay 49160–49660/udp
```

## Host layout

| Path | Contents |
| --- | --- |
| `/opt/asdesk/releases/asdesk-api-<utc>-<sha>/` | Immutable releases: bundled `dist/*.mjs`, `migrations/`, `build-info.json`. No `node_modules`. |
| `/opt/asdesk/current` | Symlink to the active release, switched atomically. |
| `/opt/asdesk/shared/.env` | Configuration and secrets, `root:asdesk 0640`. |
| `/opt/asdesk/downloads/` | Desktop installers, served at `https://<domain>/downloads/`. |
| `/opt/asdesk/backups/` | `pg_dump` archives: nightly 03:40 and before every migration, kept 14 days. |
| `asdesk-api.service` | systemd unit, runs as the unprivileged `asdesk` user with a strict sandbox. |
| `/etc/nginx/sites-available/<domain>.conf` | vhost written by provisioning; the certificate is managed by certbot (`certonly`). |
| `/etc/turnserver.conf` | coturn config written by provisioning; a certbot deploy hook copies renewed certificates to coturn. |
| `/usr/local/bin/asdesk-admin` | Operator CLI on the host (`devices`, `revoke`, `restore`, `sessions`, `summary`). |

## First-time setup

1. Point the domain's A record at the host.
2. Create `deploy/.env.vps` from `deploy/.env.vps.example` (host, pinned host-key fingerprint,
   domain, ports). The file is gitignored and holds no password.
3. `npm run server:setup-ssh` — pins the host key, creates `~/.ssh/asdesk_deploy` and installs it,
   asking for the root password once. Every later command uses the key.
4. `npm run server:provision` — creates the `asdesk` user and database, generates secrets, writes
   the nginx vhost and obtains a certificate, installs and configures coturn, installs the systemd
   units and nightly backup timer. Safe to re-run at any time; it repairs drift and never rotates
   secrets.
5. `npm run server:deploy` — first release.
6. Publish an installer (`npm run desktop:package`, then `npm run desktop:publish`) and share
   `https://<domain>/downloads/ASDesk-Setup-x64.exe`.

## Who can register a computer

`ENROLLMENT` in the host profile decides; `npm run server:provision` writes it to the server as
`ENROLLMENT_MODE`. `curl https://<domain>/health` shows the active mode.

- `open` (production): any installed app registers itself on first launch and gets an ID, like
  AnyDesk. Every connection still requires the person at the other computer to accept. Registration
  is limited to 10 per minute per client address; remove unwanted computers with
  `npm run server:admin -- revoke <id>`.
- `token` (the default): a computer can only register with the enrollment token
  (`npm run server:token`), which the app then asks for.

Switching modes needs no new app release: change `ENROLLMENT`, run `server:provision`, then
`systemctl restart asdesk-api` on the host (or `npm run server:deploy`).

Firewall: if the provider has a network firewall, open TCP 80/443, UDP+TCP 3478, TCP 5349 and UDP
49160–49660. Provisioning adds the same rules when `ufw` is active.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run server:deploy` | Type-check and test locally, bundle, upload, back up + migrate if needed, switch, restart, health-check; rolls back automatically if the new release is unhealthy. `-- --skip-tests` skips the local gate. |
| `npm run server:status` | Active release, services, certificate expiry, TURN, device/session counts, last backup. |
| `npm run server:logs` | Recent API logs. `-- -f` follows, `-- -n 500` for more, `-- turn` for coturn. |
| `npm run server:rollback` | Re-activate the previous release. |
| `npm run server:token` | Print the server URL and enrollment token (only needed when enrollment is `token`). |
| `npm run server:admin -- devices` | List computers (`-- devices --all` includes revoked). Also `revoke <id>`, `restore <id>`, `sessions [n]`, `summary`. |
| `npm run server:backup` | Take a database backup now. |
| `npm run desktop:publish` | Upload the newest `release/*-Setup.exe` to `https://<domain>/downloads/ASDesk-Setup-x64.exe` (checksum-verified; the old `CompanyRemote-Setup-x64.exe` link points to the same file). |

Add `-- --host <name>` to target another profile (`deploy/.env.vps.<name>`).

## How a deploy works

`deploy/asdesk.sh` builds with `tools/build-server.mjs`, which bundles the server, migration runner
and admin CLI with esbuild so the host needs only Node. It uploads the tarball and `deploy/remote/`
into a private temporary directory, then runs `release.sh deploy` as root:

1. A lock prevents concurrent deploys.
2. The tarball is unpacked into a new release directory owned by root (read-only to the service).
3. Pending migrations are counted. If any, a `pre-deploy` backup is taken, then all pending
   migrations run in one transaction. A failure changes nothing and the old release keeps serving.
4. `current` is switched with an atomic rename and the service is restarted.
5. Healthy means `/ready` answers **and** the listening process is the one systemd just started.
6. If not healthy, `current` is switched back, the old release restarted and the failed release
   deleted; the command exits non-zero and keeps the tarball locally.
7. The five newest releases are kept.

Migrations run while the old release still serves, so they must be additive: add columns or
tables first, stop using old ones in a later release, drop them after that. A rollback does not
undo migrations; restore a backup with `pg_restore` if that is ever required.

## Sessions per computer

A technician's computer may run up to 8 sessions at once (`MAX_CONTROLLER_SESSIONS` in
`services/control-api/src/rendezvous.ts`, pending requests included; the error is `session_limit`).
A computer being helped accepts one helper at a time and cannot control others meanwhile. Requests
are limited to 10 per minute per computer and 5 per minute to the same computer.

## Security properties

- Secrets are generated on the host (`openssl`) and never leave it, except the enrollment token
  when an operator asks for it. The session signing key must never change: every enrolled computer
  pins its public half. Rotating the enrollment token is safe: edit `ENROLLMENT_TOKEN` in
  `/opt/asdesk/shared/.env`, then `systemctl restart asdesk-api`.
- The API listens on 127.0.0.1 only. nginx sets `X-Forwarded-For` to the client address and the API
  trusts it only from 127.0.0.1 (`TRUST_PROXY`), so rate limits apply per client and cannot be
  spoofed.
- The service runs as `asdesk` with no capabilities, a read-only file system, private /tmp and no
  access to home directories (`systemd-analyze security asdesk-api` rates it 2.9, "OK").
- TURN credentials are HMAC-based, per device and expire after 10 minutes. The relay refuses
  private, loopback and link-local destinations, TLS 1.0/1.1 and DTLS.
- Only one API process may own the database (PostgreSQL advisory lock); a restart ends open
  requests and sessions and computers reconnect with fresh consent.

## Verifying a deployment end to end

`tools/desktop-e2e.ts` can drive two real app instances against the deployed server with media
forced through the relay:

```powershell
$env:E2E_SERVER='https://asdesk-api.raiapp.dev'; $env:E2E_ENROLLMENT_TOKEN='<token>'; $env:E2E_RELAY='1'
npm run desktop:build; npm run desktop:e2e
```

It prints the enrolled test device IDs; revoke them afterwards with
`npm run server:admin -- revoke <id>`. `npm run server:smoke` checks the bundled release against a
disposable local PostgreSQL without touching the server.
