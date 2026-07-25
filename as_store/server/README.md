# AS Store — Backend API (Express + PostgreSQL)

The store's own API. Connects to the **`as_store`** database, handles admin login, serves the
product catalog, and stores uploaded images. Separate from the marketing site's `server/` so the
shop stays decoupled. Runs on **port 8081** (the marketing API uses 8080).

```
AS Store (Next.js, :5180) ──► this API (:8081) ──► PostgreSQL (as_store)
Admin CMS (later)         ──┘                       └── /uploads (images on disk)
```

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | — | Liveness check |
| POST | `/api/auth/login` | — | Admin login → `{ token }` |
| GET | `/api/auth/me` | admin | Current admin |
| GET | `/api/categories` | — | Visible categories (`?all=1` + auth → include hidden) |
| POST/PUT/DELETE | `/api/categories[/:id]` | admin | Manage categories |
| GET | `/api/products` | — | List. Filters: `?category=slug`, `?featured=1`, `?search=`, `?limit=` (`?all=1` + auth → include hidden) |
| GET | `/api/products/:slug` | — | One product + image gallery |
| POST/PUT/DELETE | `/api/products[/:id]` | admin | Manage products |
| POST | `/api/products/:id/images` | admin | Add an image URL to a product |
| DELETE | `/api/products/:id/images/:imageId` | admin | Remove a product image |
| POST | `/api/uploads` | admin | Upload an image file → `{ url }` |

Responses are **camelCase**; DB columns are snake_case (mapped in `src/app.js`).

## Run locally

```bash
cd as_store/server
cp .env.example .env      # set DATABASE_URL (postgres://postgres:PASSWORD@127.0.0.1:5432/as_store)
npm install
npm run migrate           # required after schema changes; safe to re-run
npm run seed              # optional — re-loads db/seed.sql
npm start                 # http://localhost:8081
```

Quick check: http://localhost:8081/api/health → `{"ok":true}`.

## Online payment (Whish Pay)

An order is either `cod` or `whish`. For `whish` the API creates the payment (`src/whish.js` — the
secret never leaves the server), stores the hosted `collectUrl` on the order and leaves it **unpaid**;
only Whish's own status endpoint may flip it to paid, so a callback or a redirect is just a trigger to
re-check, never proof.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/payment/methods` | — | `{ cod, whish }` — what checkout may offer (the mobile app asks first) |
| GET | `/api/orders/whish/callback` | — | Whish server-to-server ping → re-check + settle |
| GET | `/api/orders/whish/return` | — | Browser return leg for **app** payments: settles, then deep-links back into the app |
| POST | `/api/orders/:id/reconcile` | session or track token | Force a re-check (missed callback, local testing) |

**Web** checkout redirects back to the storefront order page. The **mobile app** can't be redirected
to directly (Whish only sends browsers to http(s)), so it posts its deep link as `returnUrl` on the
order and Whish returns through `/api/orders/whish/return`, which bounces to
`<scheme>://orders/<id>?placed=1|failed=1&t=<trackToken>`. Only schemes listed in
`APP_RETURN_SCHEMES` are honoured — anything else falls back to the storefront, so the bridge can't be
used as an open redirect.

Whish is advertised by `/api/payment/methods` only when its credentials and both
public HTTPS return origins are configured. This prevents checkout from offering
a payment route that cannot complete.

## Google sign-in for the mobile app

The mobile app starts the normal Google OAuth flow at
`/api/account/google/start`, passing an allow-listed `appReturn` deep link. After
Google's server callback, the API sends the app a 120-second, single-use code
instead of exposing a customer session in the redirect URL. The app exchanges it
with `POST /api/account/google/mobile-exchange`. Run `npm run migrate` before
deploying this flow so the `mobile_auth_codes` table exists.

## Env (`.env`)

`DATABASE_URL` · `PORT` (8081) · `PUBLIC_URL` (builds uploaded image URLs) · `UPLOAD_DIR` ·
`CORS_ORIGIN` (storefront 5180 + admin 5173) · `ADMIN_EMAIL` / `ADMIN_PASSWORD` · `JWT_SECRET`.

Payments: `WHISH_BASE_URL` / `WHISH_CHANNEL` / `WHISH_SECRET` / `WHISH_WEBSITE_URL` ·
`PUBLIC_API_URL` + `STORE_PUBLIC_URL` (Whish rejects `localhost` — use a tunnel or the real domains) ·
`APP_RETURN_SCHEMES` (default `ascompany`; add Expo Go schemes explicitly for development only).
