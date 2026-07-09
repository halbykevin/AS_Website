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

## Deploy on the VPS (Ubuntu + ISPmanager)

### 1. Create the PostgreSQL database
In **ISPmanager → Databases**: create a database (e.g. `as_company`) and a user with a
password. Note them — they form your `DATABASE_URL`:
`postgres://USER:PASSWORD@127.0.0.1:5432/as_company`

### 2. Upload this `server/` folder and configure
Copy `server/` to the VPS (e.g. `/opt/as-api`), then:

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
