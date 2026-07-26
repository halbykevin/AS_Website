# Deploying AS Store to production

Target setup (mirrors the marketing site's deployment):

```
Shopper ──► https://store.as.com.lb        (Vercel — this Next.js app, root dir as_store/)
                     │
                     └─► https://store-api.as.com.lb   (VPS — as_store/server on port 8081, PM2)
                                ├── PostgreSQL `as_store` (separate from as_company)
                                ├── /opt/as-store-api/uploads   (admin-uploaded images)
                                └── /opt/as-store-scraper       (Python import tool, optional)
```

## Shipping changes: `npm run deploy`

Day to day you do **not** follow the steps below — they are first-time setup. Once the
API is running, ship changes with:

```bash
npm run deploy            # from as_store/server — deploys the store API
npm run deploy:all        # both APIs (website + store)
npm run deploy -- --dry-run
```

This runs [`deploy.sh`](../deploy.sh) on the VPS, which pulls the branch once and deploys
both APIs from the **single repo clone at `/opt/as-company`**, each with its own dependency
install, schema check, PM2 process and health check. See
[server/README.md](../server/README.md#shipping-a-change-npm-run-deploy) for the full behaviour.

> **The store API must live inside the repo clone**, at `/opt/as-company/as_store/server`.
> It cannot run as a standalone copy of `as_store/server/`: `src/migrate.js` resolves its SQL
> to `../../db`, i.e. **`as_store/db/`, a sibling of `server/`**. A folder containing only
> `server/` makes that path resolve to `/opt/db/schema.sql` and `npm run migrate` fails.
>
> Moving an existing hand-copied `/opt/as-store-api` into the clone — once, on the VPS:
>
> ```bash
> cp /opt/as-store-api/.env /opt/as-company/as_store/server/.env
> # keep UPLOAD_DIR=/opt/as-store-api/uploads in that .env so the images stay where they are
> pm2 delete as-store-api
> cd /opt/as-company/as_store/server && npm install
> pm2 start src/index.js --name as-store-api && pm2 save
> curl http://127.0.0.1:8081/api/health
> ```
>
> `deploy.sh` refuses to deploy the store until that `.env` is in place, and prints these
> same steps if it is missing.

The store ships **unpublished**: visitors see the branded "Coming soon" page until you flip
**Admin → Settings → Site visibility → Published** (preview the hidden site any time with
`https://store.as.com.lb/?preview=1`). `/admin` is never gated.

---

## 1. VPS — create the database

In **ISPmanager → Databases** create database `as_store` with a user + password
(or with psql: `CREATE DATABASE as_store; CREATE USER as_store_user WITH PASSWORD '...';
GRANT ALL PRIVILEGES ON DATABASE as_store TO as_store_user;` and on Postgres 15+:
`\c as_store` then `GRANT ALL ON SCHEMA public TO as_store_user;`).

## 2. VPS — configure the API

The code arrives with the repo clone (`/opt/as-company`) — do **not** copy `as_store/server/`
on its own; see the note above about `../../db`. If you want the admin **Import** (scraper)
tool in production, also copy `as_store/scraper/` to `/opt/as-store-scraper` and install its
Python deps (`pip3 install requests beautifulsoup4 lxml PyYAML tqdm`).

```bash
cd /opt/as-company/as_store/server
cp .env.example .env && nano .env
```

Production `.env`:

```ini
DATABASE_URL=postgres://as_store_user:THE_PASSWORD@127.0.0.1:5432/as_store
PORT=8081
PUBLIC_URL=https://store-api.as.com.lb
UPLOAD_DIR=/opt/as-store-api/uploads
CORS_ORIGIN=https://store.as.com.lb
ADMIN_EMAIL=<your admin email>
ADMIN_PASSWORD=<a strong password>
JWT_SECRET=<NEW long random string — don't reuse the local one>
# Order emails (same mailbox you tested locally — rotate the password if you haven't yet)
SMTP_HOST=mail.as.com.lb
SMTP_PORT=465
SMTP_USER=orders@as.com.lb
SMTP_PASS=<mailbox password>
ORDERS_NOTIFY_TO=orders@as.com.lb
STORE_URL=https://store.as.com.lb
# NEVER echo login codes in production responses
OTP_DEV_ECHO=0
# Scraper (only if you copied it)
PYTHON_BIN=python3
SCRAPER_DIR=/opt/as-store-scraper
SCRAPE_DIR=/opt/as-store-api/scrapes
```

Generate the secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 3. VPS — restore the local database

The full local dump (schema **and** all products/categories/brands/settings) is prepared at
`as_store/db/as_store-full-2026-07-03.sql` (gitignored — transfer it by hand):

```bash
scp as_store/db/as_store-full-2026-07-03.sql  root@95.217.2.105:/tmp/
scp -r as_store/server/uploads                root@95.217.2.105:/opt/as-store-api/uploads
```

On the VPS:

```bash
psql "postgres://as_store_user:THE_PASSWORD@127.0.0.1:5432/as_store" -f /tmp/as_store-full-2026-07-03.sql
```

Then point the dev-machine image URLs at the production API and **start hidden**:

```sql
-- Rewrite uploaded-image URLs (idempotent; product photos are remote URLs already)
UPDATE homepage_sections SET image_url = replace(image_url, 'http://localhost:8081', 'https://store-api.as.com.lb');
UPDATE categories        SET image_url = replace(image_url, 'http://localhost:8081', 'https://store-api.as.com.lb');
UPDATE brands            SET image_url = replace(image_url, 'http://localhost:8081', 'https://store-api.as.com.lb');
UPDATE product_images    SET url       = replace(url,       'http://localhost:8081', 'https://store-api.as.com.lb');
-- Launch behind the Coming Soon page; publish later from the admin
UPDATE settings SET published = false WHERE id = 1;
-- The local test customers/orders came along in the dump — start clean (optional):
TRUNCATE orders, order_items, predictions RESTART IDENTITY;  -- drop `, predictions` (store has none)
TRUNCATE customers, otp_codes RESTART IDENTITY CASCADE;
```

> If you'd rather start with an empty catalog instead of the dump, skip the restore and just
> run `npm run migrate` (+ `npm run seed` for demo content).

## 4. VPS — run it with PM2

```bash
cd /opt/as-company/as_store/server
npm install
npm run migrate         # idempotent, confirms the schema is current
pm2 start src/index.js --name as-store-api
pm2 save                # (pm2 startup was already configured for as-api)
curl http://127.0.0.1:8081/api/health   # -> {"ok":true}
```

After this, never run these by hand again — use `npm run deploy`.

## 5. DNS + SSL for the API subdomain

- **Vercel DNS**: add an **A record** `store-api` → `95.217.2.105`.
- **ISPmanager → Sites**: create `store-api.as.com.lb` as a **reverse proxy** to
  `http://127.0.0.1:8081`, then issue its **Let's Encrypt** certificate.
  (Nginx alternative: a server block that `proxy_pass http://127.0.0.1:8081;` +
  `certbot --nginx -d store-api.as.com.lb`.)
- Check: `https://store-api.as.com.lb/api/health`.

## 6. Vercel — the storefront

The repo already hosts the marketing site as one Vercel project; the store is a **second
project on the same repo**:

1. Vercel → **Add New Project** → import this Git repository.
2. **Root Directory: `as_store`** (critical). Framework preset: Next.js (auto-detected;
   default build/install commands are fine).
3. Environment variable: **`NEXT_PUBLIC_API_URL=https://store-api.as.com.lb`**.
4. **Domains**: attach `store.as.com.lb` (already created/pointed) to this project.
5. Deploy.

## 7. After it's live — checklist

- [ ] `https://store.as.com.lb` shows the **Coming soon** page; `/?preview=1` shows the store.
- [ ] `https://store.as.com.lb/admin/login` works with the production admin credentials.
- [ ] Product images load (they come from `store-api.as.com.lb/uploads/...` + scraped hosts).
- [ ] Place a test order (guest checkout) → confirmation email arrives + copy at orders@as.com.lb,
      admin sees it under Orders.
- [ ] When ready to launch: **Admin → Settings → Site visibility → Published → Save**.

## Known production caveats

- **Customer OTP login is not wired to a delivery channel yet** (WhatsApp/SMS decision pending).
  With `OTP_DEV_ECHO=0`, codes are only written to the API's PM2 logs — so shoppers can't log
  in themselves yet. **Guest checkout is unaffected** (orders + email tracking links work).
- Rotate the `orders@as.com.lb` mailbox password if you haven't since it was shared in chat.
- Back up: the `as_store` database + `/opt/as-store-api/uploads`.
