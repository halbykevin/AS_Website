# AS Company — Backend API (Express + PostgreSQL)

The API the website talks to. It connects to PostgreSQL, handles admin login,
serves/stores images, and exposes the content + reservations endpoints.

```
Browser ──► Vercel (website) ──► https://api.yourdomain.com (this server, on the VPS)
                                       ├── PostgreSQL
                                       └── /uploads (images on disk)
```

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | — | Admin login → returns a token |
| GET | `/api/settings` | — | Site content + `published` flag |
| PUT | `/api/settings` | admin | Update settings |
| GET | `/api/services` | — | List services |
| POST/PUT/DELETE | `/api/services[/:id]` | admin | Manage services |
| GET | `/api/events` | — | List events |
| GET | `/api/events/:slug` | — | One event |
| POST/PUT/DELETE | `/api/events[/:id]` | admin | Manage events |
| GET | `/api/banners` | — | List homepage banners (slideshow) |
| POST/PUT/DELETE | `/api/banners[/:id]` | admin | Manage banners |
| GET | `/api/sections` | — | List custom homepage sections |
| POST/PUT/DELETE | `/api/sections[/:id]` | admin | Manage custom sections |
| POST | `/api/reservations` | — | Visitor submits a reservation |
| GET | `/api/reservations` | admin | List reservations |
| PATCH/DELETE | `/api/reservations/:id` | admin | Update status / delete |
| POST | `/api/contact` | — | Visitor submits the `/contact` form (stored + emailed; 5 per IP / 10 min) |
| GET | `/api/contact-messages` | admin | List contact messages (newest first) |
| PUT | `/api/contact-messages/:id/read` | admin | Mark read / unread (`{ read }`) |
| DELETE | `/api/contact-messages/:id` | admin | Delete a message |
| POST | `/api/uploads` | admin | Upload an image → returns its URL |
| GET | `/uploads/:file` | — | Serve an uploaded image. Add `?w=<px>&format=webp&q=<1-100>` to get an on-the-fly resized/re-encoded variant (originals are never modified; variants cached under `uploads/.cache`). Widths bucket to 320–2000; unknown params serve the original. |

## Run locally

```bash
cd server
cp .env.example .env      # then edit DATABASE_URL, ADMIN_*, JWT_SECRET
npm install
npm run migrate           # create tables + the settings row
npm run seed              # optional: sample services + events
npm start                 # http://localhost:8080
```

Quick check: open http://localhost:8080/api/health → `{"ok":true}`.

---

## Shipping a change: `npm run deploy`

This repo holds **two** Node APIs, both deployed from a single git clone at
`/opt/as-company` on the VPS:

| App | Folder | PM2 | Port | Database |
| --- | --- | --- | --- | --- |
| `site` | `server/` | `as-api` | 8080 | `as_company` |
| `store` | `as_store/server/` | `as-store-api` | 8081 | `as_store` |

From **anywhere** (Windows, macOS, or the VPS itself):

```bash
cd server
npm run deploy                       # both APIs, current branch
npm run deploy:site                  # just this one
npm run deploy:store                 # just the store
npm run deploy -- --branch main      # a specific branch
npm run deploy -- --dry-run          # show what would happen, change nothing
npm run deploy -- --force-migrate    # migrate even if the schema looks unchanged
```

`scripts/deploy.mjs` picks the right path for the machine:

| You are on | What runs | What it does |
| --- | --- | --- |
| Windows / macOS | [`deploy.ps1`](../deploy.ps1) | Verifies the OpenSSH client, **creates + installs an SSH key on first run** (one password prompt, never again), remembers the target in `deploy.env`, pushes your branch, then runs `deploy.sh` on the VPS over SSH |
| The VPS (Linux) | [`deploy.sh`](../deploy.sh) | The deploy itself |

First time on a new machine: `npm run deploy:setup` does only the SSH key + repo
check. Connection details live in **`deploy.env`** at the repo root (git-ignored —
see `deploy.env.example`); the script asks for them once and writes them there.

**What `deploy.sh` does on the VPS**

**Preflight**, before touching anything: every selected app must have its folder and
its `.env`, so a half-configured store can't take the website down with it.

**Once**, for both apps: `git fetch` + **fast-forward only** to `origin/<branch>`
(refuses to merge, or to run on a dirty tree).

Then, for **each app independently**:

1. Installs dependencies **only if** that app's `package.json` / `package-lock.json` changed (`npm ci`, falling back to `npm install`).
2. **Detects schema changes.** Neither app has a migration-file runner — the site's `src/migrate.js` is one idempotent DDL blob, the store replays `as_store/db/*.sql` — so the script fingerprints every schema-bearing file the app owns (anything containing `CREATE/ALTER/DROP TABLE|INDEX|SEQUENCE…`, plus any `*.sql` that isn't seed data) and compares it with the previous deploy in `.deploy-state/schema-<app>.manifest`. Changed → **`pg_dump` backup first** (last 5 per app in `.deploy-state/backups/`), then `npm run migrate`. Unchanged → skipped. It reports which files moved.
3. Restarts its PM2 process — or `pm2 start` + `pm2 save` if it doesn't exist yet. **An app whose files didn't change is left running untouched**, so deploying a store change costs the website no downtime (override with `--force-restart`).
4. Health-checks `http://127.0.0.1:$PORT/api/health`. On failure it prints that app's PM2 log and **rolls the code back** to the previous commit, reverting every app it restarted this run. Databases are *not* rolled back — restore the dump if needed.

> The store's schema lives in `as_store/db/`, **outside** its server folder, because
> `migrate.js` reads `../../db`. The fingerprint covers both paths — see
> [as_store/DEPLOY.md](../as_store/DEPLOY.md) for why the store must live inside the clone.

`bash deploy.sh --help` lists every flag. Neither frontend is built here — Vercel
rebuilds both on push.

---

## Deploy on the VPS (Ubuntu + ISPmanager)

First-time setup only — after this, use `npm run deploy` above.

### 1. Create the PostgreSQL database
In **ISPmanager → Databases**: create a database (e.g. `as_company`) and a user with a
password. Note them — they form your `DATABASE_URL`:
`postgres://USER:PASSWORD@127.0.0.1:5432/as_company`

### 2. Upload this `server/` folder and configure
Copy `server/` to the VPS (e.g. `/opt/as-api`), then:

> **The live AS Company install** clones the whole repo to **`/opt/as-company`**, so the API
> lives at `/opt/as-company/server` (not `/opt/as-api`). Once it is set up, ship backend
> changes with `npm run deploy` (above) — don't pull/migrate/restart by hand.

```bash
cd /opt/as-api
cp .env.example .env
nano .env     # set the values below
```

`.env` for production:
```ini
DATABASE_URL=postgres://as_user:THE_PASSWORD@127.0.0.1:5432/as_company
PORT=8080
PUBLIC_URL=https://api.yourdomain.com
UPLOAD_DIR=/opt/as-api/uploads
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=a-strong-password
JWT_SECRET=<paste a long random string>
```
Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### 3. Install, migrate, run with PM2
```bash
npm install
npm run migrate
npm run seed            # optional sample content
sudo npm i -g pm2
pm2 start src/index.js --name as-api
pm2 save
pm2 startup             # run the line it prints, so it survives reboots
```

### 4. Point the API subdomain at the VPS (DNS in Vercel)
In your **Vercel dashboard → Domains/DNS**, add an **A record**:
`api` → `95.217.2.105` (your VPS IP).

### 5. Expose it on HTTPS (ISPmanager)
In **ISPmanager → Sites**, create `api.yourdomain.com` as a **reverse proxy** to
`http://127.0.0.1:8080`, then issue a **Let's Encrypt SSL** certificate for it.

> Not keeping ISPmanager? Do the same with Nginx + certbot: a `server` block for
> `api.yourdomain.com` that `proxy_pass http://127.0.0.1:8080;`, then
> `sudo certbot --nginx -d api.yourdomain.com`.

### 6. Connect the website (Vercel)
In the Vercel project, set env var **`VITE_API_URL=https://api.yourdomain.com`** and redeploy.

---

## Notes & hardening (later)
- Admin is a **single account** from `.env`. To add multiple editors, move credentials
  into a `users` table with hashed passwords.
- Reservations are open to the public (no captcha) — add rate-limiting if it gets abused.
- Back up: the PostgreSQL database **and** the `uploads/` folder.
- To move VPS: copy `uploads/`, restore a `pg_dump` of the database, redeploy this folder.
