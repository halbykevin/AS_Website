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

## Account deletion

`DELETE /api/account` (customer session) is what the app's **Account → Delete account** screen calls,
and what both app stores require to exist before they will list an app that creates accounts.

Deleting the `customers` row cascades to everything personal — notifications, device tokens and prefs,
login history, survey answers, spins, vouchers, the AS Wallet ledger (and with it the balance, which
is only ever that ledger's sum), pending OAuth codes — so pushes stop at once and the
account cannot be signed back into. Orders are the exception: `orders.customer_id` is
`ON DELETE SET NULL`, so the sale survives for bookkeeping, refunds and warranty claims, while the
endpoint scrubs the personal columns on those rows first (`full_name` becomes `Deleted account`; phone,
email, address, city and notes are emptied). Order items and money are untouched.

An order still in flight (`pending`, `confirmed`, `shipped`) blocks the delete with **409** and
`code: "orders_in_flight"` plus the order ids, so the app can explain instead of failing — erasing the
delivery address of a parcel already on its way helps nobody.

The customer's JWT stays cryptographically valid until it expires, but every route that loads the row
now 404s, and the app drops the token on its first 401/404. Nothing needs revoking.

> Whatever this endpoint does must stay in step with the "Deleting your account" section of the
> privacy policy (`as_store/src/components/PrivacyPolicy.jsx`) — that text is what Google Play and the
> App Store review, and it promises exactly the behaviour described above.

## Push device tokens

`POST /api/devices` registers a token; `DELETE /api/devices` detaches it from the account (sign-out)
or revokes it entirely (`mode: "revoke"`). A row that belongs to an account may only be changed **by
that account** — knowing the Expo token is not authorization, since tokens travel through push
payloads and logs, and without the check anyone holding one could switch off a customer's order
notifications. Guest rows (no `customer_id`) have no owner to verify against, so knowledge of the
token is all a guest opt-out needs. An unknown token returns the same `{ ok: true }` as a real detach
rather than confirming which tokens are registered.

Because of this, the app captures its bearer token **before** clearing the session at sign-out and
sends it with the detach call — see `detachDeviceFromCustomer` in `mobile/src/lib/pushToken.js`.

## Google sign-in for the mobile app

The mobile app starts the normal Google OAuth flow at
`/api/account/google/start`, passing an allow-listed `appReturn` deep link. After
Google's server callback, the API sends the app a 120-second, single-use code
instead of exposing a customer session in the redirect URL. The app exchanges it
with `POST /api/account/google/mobile-exchange`. Run `npm run migrate` before
deploying this flow so the `mobile_auth_codes` table exists.

## Catalog import

The admin **Import products** page spawns `as_store/scraper/scrape.py` and ingests its
`products.json` (brands, categories, products, images — idempotent on `source_url`).
When the source shop blocks the VPS's IP, run the same import by hand from a machine
that isn't blocked: `npm run import-scrape` / `node src/import-scrape.js` — see
[OFFLINE-IMPORT.md](../OFFLINE-IMPORT.md).

A whole-catalog run also **delists**: a product the shop no longer sells is hidden
here (`visible = false` + a `products.delisted_at` stamp), never deleted, and un-hidden
if it comes back. It only fires when the scrape covers enough of what we already hold
from that shop — a half-finished crawl otherwise looks identical to a mass delisting. `npm run backfill-images` pulls any
still-hotlinked product photo onto our own `/uploads`.

## Env (`.env`)

`DATABASE_URL` · `PORT` (8081) · `PUBLIC_URL` (builds uploaded image URLs) · `UPLOAD_DIR` ·
`CORS_ORIGIN` (storefront 5180 + admin 5173) · `ADMIN_EMAIL` / `ADMIN_PASSWORD` · `JWT_SECRET`.

Payments: `WHISH_BASE_URL` / `WHISH_CHANNEL` / `WHISH_SECRET` / `WHISH_WEBSITE_URL` ·
`PUBLIC_API_URL` + `STORE_PUBLIC_URL` (Whish rejects `localhost` — use a tunnel or the real domains) ·
`APP_RETURN_SCHEMES` (default `ascompany`; add Expo Go schemes explicitly for development only).
