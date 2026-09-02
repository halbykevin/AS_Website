# AS Company Website

Website for **AS Company (Absolute Solutions SAL)** — market leader in telecommunication and electronics in Lebanon since 2008. The site showcases what AS Company does and promotes **upcoming events**. Clicking an event (banner or card) opens a **pre-filled WhatsApp chat** to the admin-configured number (`settings.whatsapp_number`) so visitors reserve over WhatsApp; if no number is set it falls back to the event's `ticket_url` (the partner's own booking page). A built-in **admin dashboard** lets staff edit all content, manage events, and run an **events sync** that pulls what's on from Lebanon's ticketing sites into the site.

> The site carries **no ticketing-partner branding**. The "Reservations powered by Ticketing Box
> Office" badge and its logo are gone from the footer, `/events`, the event detail page and the
> mobile app, and `public/ticketing-box-office.png` + the `ticketing` block in `content/site.js`
> were deleted with them. Partner names survive only in the admin's sync page, where they name a
> data source. The banner slider is expected to gain a logo + slogan later — nothing is there now.

> The old in-house reservation form was removed: the API endpoints, admin page, and on-site form are gone. The `reservations` table is retained in the DB (no longer read/written) in case the data is needed later.

## Architecture

```
Browser ──► Vercel (React static site, this repo root)
                │
                └─► https://api.yourdomain.com  (Node/Express API in /server, on the VPS)
                          ├── PostgreSQL          (data)
                          ├── /uploads            (logo & event images on disk)
                          ├── /scrapes            (per-run scraper output, runtime-only)
                          └── WebScarping/         (Python scraper, spawned per scrape job)
```

- **Frontend** — React 18 + Vite 5 + Tailwind 3 + React Router 7. Hosted on **Vercel**.
- **Backend** — Express + PostgreSQL (`pg`) in [server/](server/). Runs on the **VPS** under PM2, exposed at an `api.` subdomain with SSL. JWT-based single-admin auth. Images stored on disk.
- The two talk over HTTP; the frontend's API base is `VITE_API_URL`.

> History: an earlier iteration used PocketBase — fully removed. Don't reintroduce PocketBase concepts.

## Scripts

Frontend (repo root): `npm run dev` · `npm run build` · `npm run preview`
Backend ([server/](server/)): `npm run dev` · `npm start` · `npm run migrate` · `npm run seed`

`npm run kill` (repo root) stops every dev server across all the sub-projects at once —
it clears whatever is listening on the project's ports (vite 5173-5175, next 5180, site API
8080, store API 8081, expo 8082-8083) and their child processes. `npm run kill:dry` lists them
without killing. See [scripts/kill-dev.mjs](scripts/kill-dev.mjs).

**Deploy the APIs:** `npm run deploy` (from any of the three package folders, on any OS).
The repo holds **two** Node APIs, both served from one clone at `/opt/as-company` on the VPS:
`site` = [server/](server/) → pm2 `as-api` :8080, and `store` = [as_store/server/](as_store/server/)
→ pm2 `as-store-api` :8081. Target one with `npm run deploy:site` / `deploy:store`.

[scripts/deploy.mjs](scripts/deploy.mjs) routes to [deploy.ps1](deploy.ps1) on Windows/macOS —
which checks/creates the SSH key, installs it on the VPS on first run, remembers the target in
`deploy.env` (git-ignored), pushes the branch, then runs [deploy.sh](deploy.sh) over SSH — or
straight to `deploy.sh` when already on the VPS. `deploy.sh` preflights each app's `.env`,
fast-forwards the branch **once**, then per app: installs deps only when its manifests changed,
**fingerprints every schema-bearing file it owns** (the store's includes `as_store/db/*.sql`,
since its `migrate.js` reads `../../db`) to decide whether `npm run migrate` is needed (taking a
`pg_dump` first), restarts its PM2 process, and health-checks `/api/health`. An app with no
changes is left running untouched; a failed health check rolls the code back. Flags: `--app`,
`--branch`, `--dry-run`, `--force-migrate`, `--skip-migrate`, `--force-restart`.
Details in [server/README.md](server/README.md).

> The store API **must** live inside the clone (`/opt/as-company/as_store/server`) — a standalone
> copy of `as_store/server/` breaks `migrate.js`'s `../../db` lookup. See [as_store/DEPLOY.md](as_store/DEPLOY.md).

## Mobile app (`mobile/`)

An Expo (SDK 54 / React Native 0.81) app that is **both** products in one binary: the marketing site's
events and What We Do, and the full AS Store storefront with accounts, cart, checkout and orders. It
talks to the same two APIs as the web (`websiteApiUrl` / `storeApiUrl`, plus `storeWebUrl` for the
legal pages it links out to) and has no backend of its own. Everything visual comes from
[mobile/src/theme](mobile/src/theme) + [mobile/src/ui](mobile/src/ui) — build new screens from those
primitives rather than raw `View`/`Text`. Full detail in [mobile/README.md](mobile/README.md).

Store-publishing requirements that are easy to break and hard to notice:

- **Account deletion must exist and must stay honest.** `DELETE /api/account` +
  [mobile/app/account/delete.jsx](mobile/app/account/delete.jsx). Deleting cascades everything
  personal but keeps the order rows (bookkeeping/warranty) with their PII scrubbed, and refuses while
  an order is in flight. The endpoint, that screen's copy, and the "Deleting your account" section of
  [as_store/src/components/PrivacyPolicy.jsx](as_store/src/components/PrivacyPolicy.jsx) describe the
  same behaviour on purpose — that policy is what Google Play and the App Store review. Anything new
  that hangs off a customer (the AS Wallet ledger, for instance) must cascade on `customers.id` and
  be named in all three.
- **The privacy policy covers the app, not just the website**, and is reachable from the account tab
  **signed out** ([mobile/app/legal.jsx](mobile/app/legal.jsx)). Anything new the app collects — push
  tokens, device info, a new sign-in method — belongs in that page in the same change.
- **OTA updates**: `expo-updates` with the `fingerprint` runtime policy and a channel per EAS profile.
  `npm run update` ships a JS-only fix without a store review; anything touching native code needs a
  real build, and fingerprint is what stops such an update from reaching a binary that can't run it.
- **Error containment — nothing should take the whole app down.** Four layers, each catching what the
  one below can't see: `<Boundary>` around a section ([mobile/src/components/Boundary.jsx](mobile/src/components/Boundary.jsx)),
  `ScreenBoundary` exported as every route's `ErrorBoundary` (a broken screen keeps the tab bar
  alive), [CrashScreen.jsx](mobile/src/components/CrashScreen.jsx) as the root last resort, and
  `installGlobalErrorHandler()` ([mobile/src/lib/errors.js](mobile/src/lib/errors.js)) for throws
  **outside** render — which React boundaries cannot see and which otherwise kill a release build.
  New screens should keep the `ErrorBoundary` export; new data-driven sections should get a
  `<Boundary>`. All of it funnels through `reportError`, the one place to wire a reporting service.
  There is no crash *reporting* wired up today.

## Checkout requires a mobile number (store + app + API)

Every order carries a number someone can actually be called on, whatever the sign-in was. Google and
email-code sign-ins bring no mobile with them, so for those customers the checkout field starts empty
and this is the only thing between that and an undeliverable order.

- The rule lives in `POST /api/orders`: `normalizeMobile(phone)` must resolve, for **signed-in
  customers too**, not only for guests. That is the one place the website, the app and anything else
  all pass through.
- Both checkouts mirror the same normaliser client-side (`isValidMobile` in
  [as_store/src/lib/orders.js](as_store/src/lib/orders.js) and
  [mobile/src/lib/format.js](mobile/src/lib/format.js)) purely to save the round trip. Loosen the
  server rule without loosening these and valid numbers get rejected before they are ever sent.
- A signed-in account with **no** `customers.mobile` gets the number backfilled from the order, so it
  is never typed twice. Conditional on the column being empty and on no other account owning it — the
  number on file is what signs them in, and a delivery contact must not silently rewrite it.

## Add-to-Bag flight (mobile app)

The product photo arcs out of the card and lands on the bag icon
([mobile/src/components/FlyToCart.jsx](mobile/src/components/FlyToCart.jsx)), with the tab-bar badge
popping as the count rises. Reanimated only — no native dependency, so it ships as an OTA update.

- **The overlay is mounted above every screen** (in `AppProviders`). It has to be: the image starts
  inside a virtualized list and ends on the app's chrome, and nothing rendered inside either one can
  cross that boundary.
- **The landing spot is registered, and registrations are a stack.** `useCartTarget()` on the tab
  bar's bag, and again on the product screen's header bag — a screen pushed over the tabs covers the
  tab bar, so it claims the target while it is up and hands it back on unmount. Each call gets its
  own identity so two screens stack rather than overwrite.
- **The flight is decoration only.** `dispatch(addItem(...))` runs first and unconditionally; leaving
  the screen mid-flight cannot lose the item, and reduced motion skips the animation entirely.
- Source views need `collapsable={false}` — Android flattens layout-only views away, and a view that
  no longer exists cannot be measured.

## Call for price (store + app + admin)

Per-product flag (`products.call_for_price`) that hides a price and offers a WhatsApp enquiry
instead — for lines AS may not advertise a price on (Apple hardware). Copy lives in
`settings.call_for_price_*`; helpers in [as_store/src/lib/callForPrice.jsx](as_store/src/lib/callForPrice.jsx)
and [mobile/src/lib/callForPrice.js](mobile/src/lib/callForPrice.js).

- **Hiding it means the API stops sending it.** `productJson(row, admin)` nulls
  `price`/`oldPrice`/`salePercent` unless the caller is an authenticated admin — hiding the number in
  the UI while still serving it in JSON (to scrapers, to Google) would not be hiding it. The detail
  routes carry `optionalAuth` for exactly that; the admin's `?all=1` list and the create/update
  responses pass `admin: true` so the CMS still sees the real price. The price stays in the column —
  the sales engine, past orders and switching the flag back off all need it.
- **It must also be unsellable.** `POST /api/orders` rejects any such line with
  `code: 'call_for_price'`, naming the product. That is the real guard: the storefront hides Add to
  Bag, but a bag saved before the flag was set still arrives at checkout.
- Price arithmetic must skip these: `productJsonLd` omits the Offer price (else Google keeps
  advertising it), and `catalogFilters.js` + the API's `minPrice/maxPrice` exclude them from ranges
  and sort them last — a null price otherwise reads as $0 and wins "Price: Low to High".
- Marking is manual: a toggle in the product editor and a bulk **Call for price / Show price** pair
  in the admin products list (`PUT /api/products/bulk/call-for-price`), so filtering to Apple →
  Laptops and flipping all of them is one click. Nothing is automatic — a brand rule would hide
  prices on scraper-imported products nobody has looked at yet.

## Catalog sync (store)

`cd as_store && npm run sync-catalog` scrapes the source shop **from your machine**
(the VPS's IP is blocked, which is the whole reason the script exists), ships the photos
and `products.json` up, and imports them —
[scripts/sync-catalog.mjs](as_store/scripts/sync-catalog.mjs) →
[server/src/import-scrape.js](as_store/server/src/import-scrape.js) →
`ingestProducts` in [server/src/scraper.js](as_store/server/src/scraper.js). Full detail in
[as_store/OFFLINE-IMPORT.md](as_store/OFFLINE-IMPORT.md).

- **There is no mobile database.** The app reads the same API and Postgres as the web, so
  an import is live everywhere the moment it commits — no rebuild, no OTA. `--purge` only
  clears the *Next.js* storefront cache; the app's own React Query cache is 5 minutes.
- **A whole-catalog run is a mirror, not an append.** `applyDelist()` hides what the shop
  has stopped selling (`visible = false` + a `products.delisted_at` stamp) — the import
  still never deletes a product, because past orders, warranty lookups and photos hang off
  the row. A product the shop lists again is un-hidden by the next run.
- `delisted_at` is what makes a hide *ours*, and it is the only thing standing between a
  nightly sync and someone's manual decision: **hidden + stamped** = we hid it (restorable),
  **hidden + no stamp** = a person hid it (never touched), **visible + stamped** = a person
  overrode us (never touched). Anything that changes product visibility automatically must
  respect those three states.
- **A partial scrape is indistinguishable from a mass delisting**, so delisting only runs on
  a `--mode site` scrape with no `--limit`, and only when the file covers ≥ `--delist-floor`
  (0.5) of what we **still list** from that host. Below it: nothing is hidden, and the run
  exits 3. Already-archived rows are out of that ratio on purpose — counting them would make
  the guard refuse for ever once a shop shrinks (pacmax.me went 1787 → 384, which scores 21%
  against everything ever imported and 100% against what we still list). Scope is by source
  host, matched with an anchored regex: `LIKE '%//host/%'` needs a slash after the hostname
  and silently matched **nothing** for a shop on plain WordPress permalinks
  (`https://pacmax.me?product=slug`), so the mirror reported "on" and hid nothing for months.
  Hand-made products (`source_url = ''`) and other shops' imports can never be caught.
- **Identity is `source_url`, then `products.source_sku`.** A shop that deletes and re-creates
  a product hands it a new url, and a url-only match reads that as a new product — the old row
  stays live and the catalog carries both (one pacmax rebuild did this 30 times). The SKU
  survives a re-slug. It is scoped to the same host and treats two matches as no match; it is
  never shown to a customer and is not `mpn` (that one is staff-owned and goes to Google).
- Everything else stays additive on purpose: category images are snapshotted and restored,
  admin-added product images survive, and `--dry-run` names every product it would hide.

## Daily Spin (mobile app + store admin)

A once-per-cooldown prize wheel that lives **only in the mobile app** and is driven entirely from
the AS Store CMS at `/admin/spin`. Schema in [as_store/db/spin.sql](as_store/db/spin.sql), API in
[as_store/server/src/spin.js](as_store/server/src/spin.js), admin page in
[as_store/src/app/admin/spin/page.jsx](as_store/src/app/admin/spin/page.jsx), app screen in
[mobile/app/spin.jsx](mobile/app/spin.jsx).

- **The server draws the prize**, always. `POST /api/spin` picks a slice (weighted, via
  `crypto.randomInt`), records it and mints the voucher inside one transaction holding a
  per-customer advisory lock; the app then animates to the id it was handed. The wheel can never
  disagree with the award, and a customer who kills the app mid-spin has still won.
- **Sign-in is required to spin** (`requireCustomer`), but `GET /api/spin` is public so the screen
  shows the real prizes behind the sign-in prompt. The cooldown is the `spin_spins` log — the next
  spin is allowed `cooldown_hours` after the customer's last row — so reinstalling, signing out or
  changing the device clock buys nothing.
- Tables: `spin_settings` (singleton id=1: copy, `cooldown_hours`, default voucher validity),
  `spin_prizes` (the slices: `type` `percent|amount|free_delivery|gift|none`, `weight` = odds,
  `stock`, colour), `spin_spins` (the log **and** the cooldown clock), `vouchers` (what a win is
  worth — account-bound, single-use, `source` `spin|admin`). `orders` gained
  `discount_amount`/`voucher_code`/`voucher_id`, snapshotted like the delivery fee and VAT, so
  total = subtotal + delivery + VAT − discount.
- **Redemption is real money**: `redeemVoucher()` in `spin.js` is the single place the rules live
  (status, expiry, minimum order, percent cap) and is called by `POST /api/orders`. It flips the
  voucher to `used` *before* the order exists — that atomic flip is what stops double-spending —
  and `releaseVoucher()` gives it back if the order fails, Whish rejects the payment, or an admin
  cancels the order. `gift` prizes are staff-fulfilled and never touch checkout.
- The app picks rewards at checkout from `GET /api/vouchers?subtotal=`, which returns each one with
  `eligible` + the exact `discount` — the client never re-implements the money rules.
- Geometry lives in `src/lib/wheel.js` in **both** packages (a deliberate copy — the admin preview
  and the app wheel must land on the same slice). The app needs `react-native-svg`, so a native
  rebuild is required, not just an OTA update.

## AS Wallet (store credit — store + app + admin)

Spend money, get a percentage back as credit; spend the credit on a later order. Schema in
[as_store/db/wallet.sql](as_store/db/wallet.sql), API in
[as_store/server/src/wallet.js](as_store/server/src/wallet.js), CMS at `/admin/wallet`
([page](as_store/src/app/admin/wallet/page.jsx)), customer pages at `/account/wallet` on the website
and [mobile/app/account/wallet.jsx](mobile/app/account/wallet.jsx) in the app. Default:
**spend $1,000, get $50 back** (`earn_percent` = 5), CMS-editable.

> This **replaced AS Points**. The deal is identical; the unit is the one customers already think in,
> so there is nothing to convert and nothing to redeem before it can be spent — which is why the
> redeem screens, `blocksWorth`, and the whole points→voucher path are gone. `wallet.sql` converts
> any existing `loyalty_ledger` balance to credit at the old rate, once, guarded by a sentinel note.
> The `loyalty_*` tables are **retained but never read**, like `reservations` on the marketing site.

- **There is no balance column.** A balance is `SUM(wallet_ledger.amount)` — every cent traces to the
  order that earned it or the order that spent it, and nothing can drift out of step with the history
  the customer reads. Rows are append-only; a correction is another row (`earn` / `revoke` / `spend` /
  `refund` / `adjust`).
- **Earning is reconciled, not appended.** `syncOrderWallet(orderId)` compares what an order *should*
  have credited against what it already did and writes only the difference, so it is safe to call
  from anywhere an order changes — it is wired into order creation, `markWhishPaid`, and the admin
  status route. That is what makes delivered → cancelled → delivered land on the right balance
  instead of paying twice. `POST /api/admin/wallet/resync` replays it over every order (the way to
  apply a changed rate to history, or to backfill orders that predate the wallet).
- Credit lands per `settings.award_on` — `delivered` (default), `confirmed`, or `created` — and a
  cancellation always takes it back. The basis is the items subtotal minus item discounts **minus
  whatever the wallet itself paid**: delivery and VAT never earn (a free-delivery voucher therefore
  doesn't reduce it), and credit must not breed credit.
- **Spending is a payment, not a discount**, so it comes off *after* VAT — the tax is on the goods
  whoever's money buys them. `orders.wallet_amount` snapshots it beside the delivery fee and VAT, and
  total = subtotal + delivery + VAT − discount − wallet. Vouchers are untouched and still apply to
  the same order: the voucher discounts the goods, the wallet pays what is left.
- **The debit is claimed before the order exists.** `spendFromWallet()` writes it under a
  per-customer advisory lock and returns an entry id; checkout then `attachWalletSpend()`s the order
  onto it, or `releaseWalletSpend()`s it back — the same shape `redeemVoucher`/`releaseVoucher` uses,
  and the only thing that stops one balance being spent twice from two devices. `refundOrderWallet()`
  gives it back when an admin cancels; reopening a cancelled order deliberately does **not** re-take
  it.
- **Clients ask for the wallet, never for an amount.** `POST /api/orders { useWallet: true }` lets
  the server decide what `min_order` / `max_percent` / the balance allow, and prices the order from
  its own figure. `GET /api/wallet?total=` returns that same `spendable` number so a checkout can
  show it first — the client never re-implements the money rules (the same reason the vouchers list
  carries its own `discount`).
- **"Get $N back" appears on the product page and at checkout**, on both platforms
  ([as_store/src/lib/wallet.js](as_store/src/lib/wallet.js) → `creditFor`, and
  [mobile/src/components/WalletEarn.jsx](mobile/src/components/WalletEarn.jsx)). Those estimates
  mirror `walletEarnFor()` on the server exactly — item spend after discounts and after wallet
  payment, floored to the cent — so a promise made before checkout is the one the server keeps; pass
  item money only, never delivery or VAT. They render nothing when the wallet is off.

## Backend

See [server/README.md](server/README.md) for endpoints + full VPS/Vercel deploy steps.

Postgres tables: `settings` (single row, id=1, holds global content + the `published` flag +
`whatsapp_number` used to build the event reservation WhatsApp links),
`services`, `events` (each has a `ticket_url` — included in the WhatsApp reservation message — plus an
optional `category_id` → `categories`; multi-day events carry a `dates` JSONB array, and
synced rows carry `source`/`external_id` for idempotent re-sync — see **Events sync**),
`categories` (event categories shown as image tiles:
name/slug/image/sort/visible; events filter by them on the site),
`banners` (homepage slideshow: image/title/subtitle/link/active, plus an optional `event_id` →
the banner then borrows that event's image/title/link, resolved client-side in `lib/api.js`),
`sections` (admin-created homepage sections: eyebrow/heading/body/image/button/theme/visible),
`popup` (single row, id=1: a one-time announcement/ad popup —
enabled/title/body/image/link/link_label + `trigger_type` `load|scroll` with
`delay_seconds`/`scroll_percent`; `updated_at` doubles as the version the
frontend stores in localStorage to show it once),
`what_we_do` (single row, id=1: the **Absolute Solution** page copy — about/intro, vision,
mission, divisions JSONB, plus section headings) and `solutions` (the items listed on that page:
slug/title/summary/icon/image/intro/outro + an `items` JSONB array of `{title, description}`,
sort/visible — each renders a homepage "What We Do" card and a `/what-we-do/:slug` detail page),
`predictor` (single row, id=1: the **Guess the Score game** — enabled/title/subtitle/intro/
success_message + prize (`prize_title`/`prize_description`/`prize_image_url`/`prize_amount`) +
`share_url`/`share_message` (the AS Store item players share to enter) + `terms` JSONB (the red
T&C bullets) + optional `deadline` and a `closed` flag), `predictor_matches` (admin-created matches:
two teams each with a name + a club logo in `team_a_flag`/`team_b_flag` — uploaded or pasted, with the
older `team_a_code`/`team_b_code` still resolving a flagcdn.com flag for national teams — plus
stage/kickoff/sort/visible) and `predictions` (public entries: full_name/mobile + a `picks` JSONB array
of `{matchId, teamA, teamB, scoreA, scoreB}` + `share_platform`/`share_item`),
`contact_messages` (the public `/contact` form: name/email/phone/subject/message + a `read` flag —
stored **and** emailed to staff, listed at `/admin/messages`),
`wheel_entries` (the **Lucky Draw** pool: draw_number/full_name + `source` `manual|predictor`,
a `prediction_id` back-link for imported rows, and `wins`/`won_at` recording each spin),
`reservations` (legacy/retained, not used by the app). Created by [server/src/migrate.js](server/src/migrate.js);
optional sample content via [server/src/seed.js](server/src/seed.js).

The **Guess the Score** game: when enabled in `/admin/predictor` with ≥1 visible match, an animated
basketball appears in the **middle of the nav bar** ([components/predictor/BasketballButton.jsx](src/components/predictor/BasketballButton.jsx));
tapping it opens a three-step modal ([components/predictor/PredictorModal.jsx](src/components/predictor/PredictorModal.jsx)):
**(1)** guess the exact final score of the featured game (club crests + two big score boxes, gold CTA,
T&C bullets underneath), **(2)** share any item from the AS Store to an Instagram/Facebook story or
WhatsApp status (the chosen platform + item are stored on the entry), **(3)** full name + mobile →
a draw ticket. Open-state is shared via [store/predictor.jsx](src/store/predictor.jsx) (provider in
`Layout.jsx`). Submissions (`POST /api/predictions`) are public but gated by the enabled/closed/deadline
checks and one active entry per mobile; the admin reads/archives/deletes entries and exports them to Excel.

The **Lucky Draw** wheel (`/admin/wheel` → [admin/pages/WheelAdmin.jsx](src/admin/pages/WheelAdmin.jsx))
is an **admin-only** tool — there is no public page and every `/api/wheel-entries*` route is
Bearer-gated. Staff build the pool (type one entry at a time, paste a list, or **Import Guess the
Score** — which pulls every *active*, non-archived `predictions` row with its `draw_number`, keyed on
`prediction_id` so re-running refreshes instead of duplicating), then hit Play:
[components/SpinWheel.jsx](src/admin/components/SpinWheel.jsx) spins a canvas wheel — a live readout of
the name under the pointer, synthesised prize-wheel ticks (WebAudio, no assets) — and
[components/WinnerReveal.jsx](src/admin/components/WinnerReveal.jsx) announces the draw number + full
name over canvas confetti. The winner is drawn **before** the animation via rejection-sampled
`crypto.getRandomValues` and the final rotation is derived from it, so the reveal can never disagree
with the result; that geometry lives in [components/wheelMath.js](src/admin/components/wheelMath.js),
apart from the component so it stays verifiable. Each spin bumps `wins`/`won_at` on the entry
("Reset winners" clears them for a fresh round).

API responses are **camelCase**; DB columns are snake_case (mapped in [server/src/app.js](server/src/app.js)).
Public can read content; everything else needs a Bearer token.

**Contact** (`/contact` → [pages/Contact.jsx](src/pages/Contact.jsx), reached from the nav "Contact" item
and the footer): one-tap WhatsApp / email / Instagram cards next to a message form. `POST /api/contact`
is public — it validates, throttles (5 per IP / 10 min, plus a honeypot field), inserts into
`contact_messages`, then fire-and-forget emails the message to staff via
[server/src/mailer.js](server/src/mailer.js) (`sendContactEmail`, Reply-To = the visitor, so hitting
Reply answers them; needs `SMTP_*`, and lands in **orders@as.com.lb** unless `CONTACT_NOTIFY_TO`
overrides it). Storing first means a mail outage
never loses a lead — staff read them at `/admin/messages`. The channels themselves come from
`settings.contact_*` (Site Settings → Contact); the page copy defaults live in `content/site.js`
(`contact.page`).

## Web scraper

The Python e-commerce scraper in [WebScarping/](WebScarping/) (`scrape.py` + `ecom_scraper/`) is
driven from the admin dashboard, **not** rewritten in Node. [server/src/scraper.js](server/src/scraper.js)
mounts an admin-only `/api/scrape` router that **spawns `scrape.py` as a subprocess** (no shell —
args are passed as an array), writes each run to its own folder under `SCRAPE_DIR`, and serves the
output back for download (`archiver` zips the whole folder, images included).

- Endpoints (all Bearer-auth): `POST /api/scrape` starts a job → `{ id, status, log, files, ... }`;
  `GET /api/scrape/:id` polls status/log; `GET /api/scrape/:id/files/:name` downloads one export
  file; `GET /api/scrape/:id/zip` downloads everything. Jobs are tracked **in memory** (lost on
  restart); only the most recent ~20 run folders are kept.
- The product-scraping **UI was removed** from the admin: [src/admin/pages/ScraperAdmin.jsx](src/admin/pages/ScraperAdmin.jsx)
  now only drives the events sync below. The `POST /api/scrape` endpoints, `scrape.py`, and the
  `startScrape` / `downloadScrapeFile` / `downloadScrapeZip` client helpers are all still in place —
  nothing in the site calls them, so re-adding a page is enough to bring the tool back.
- `scrape.py` gained an `--auto <url>` mode (probe → single product vs. crawl) used by the backend;
  the existing `--url/--urls/--crawl` modes are unchanged.
- **Events sync** (the only tool in the admin page) — see its own section below.
- **VPS prereq:** Python 3 + `pip install -r WebScarping/requirements.txt` (and
  `playwright install chromium` only if the "JavaScript site" / `--render` option is used). Env:
  `PYTHON_BIN` (default `python3`), `SCRAPER_DIR` (default `../WebScarping`), `SCRAPE_DIR`
  (default `server/scrapes`).

## Events sync (three ticketing sites → one events page)

`POST /api/scrape/events` runs [WebScarping/events_sync.py](WebScarping/events_sync.py), which
scrapes **ticketingboxoffice.com**, **tickit.co** and **ihjoz.com** into one `events.json`;
[server/src/scraper.js](server/src/scraper.js) then imports it. Driven from `/admin/scraper`
(pick the sites, the country, and whether to clear what the sites have taken down).

- **One module per site** in [WebScarping/event_sources/](WebScarping/event_sources/), each
  exporting `KEY`/`LABEL`/`fetch(fetcher, limit, country)`. Adding a fourth site means writing one
  module and listing it in `SOURCES` — the pipeline, the importer and the admin need nothing new
  beyond its key in `EVENT_SOURCES` (scraper.js) and `SOURCE_INFO` (ScraperAdmin.jsx). `tbo.py`
  parses the homepage's isotope cards, `tickit.py` calls the JSON API tickit.co's own browser
  bundle calls, `ihjoz.py` walks `/events/browse`.
- **Three sites, one category vocabulary.** Ticketing Box Office has editorial categories, ihjoz an
  event-type dropdown, Tick'it only music genres — left alone that is three near-duplicate tiles for
  the same thing. [categories.py](WebScarping/event_sources/categories.py) folds every source label
  into `CANONICAL` **before** it reaches the database, and its names deliberately reuse the ones
  already in Postgres so their admin-set tile images survive. `ALIASES` is the tuning point;
  `refine()` improves a vague category from the event's own title, and only a vague one — an
  editorial tag from the site itself always wins over a keyword.
- **Two things look like duplicates and need opposite treatment**
  ([dedupe.py](WebScarping/event_sources/dedupe.py)): a **run** (one show, many nights — Tick'it
  published a ten-night stand-up run as ten events) is *merged* into one event with ten `dates`,
  and a **cross-listing** (the same night sold on two sites) is *dropped*, keeping whichever source
  ranks first in `SOURCES`. Both need an overlapping date to fire, which is what stops two
  unrelated nights sharing a generic name from being welded together; a run additionally needs the
  same venue, so a touring show stays several events.
- **Identity is `(source, external_id)`**, and the importer matches on **every** listing id a run
  covers (`mergedIds`), not just today's primary — when the first night sells out and the site
  retires it, the run gets a new primary id, and that is what stops it becoming a second row.
  Hand-made events (`source = ''`) are never touched by any of this.
- **A partial crawl looks exactly like a site emptying its calendar**, so `events_sync.py` only sets
  `complete` when every requested source answered and no `--limit` was given, and the importer only
  clears no-longer-listed events on a complete run, per source, and only for a source that returned
  events. Explicitly-named rows (folded nights, cross-listings, past events) are always cleared —
  the run identified them. Exit codes: 0 complete · 3 partial (imported, nothing pruned) · 1 nothing
  scraped (nothing changed).
- **Categories are the admin's.** The importer upserts by slug and never overwrites a name; the tile
  image is only filled when empty. Rename or re-picture a category at `/admin/categories` and the
  next sync leaves it alone.
- `--country Lebanon` (the default) keeps Tick'it — which also sells in the Gulf and Europe — to what
  AS Company's visitors can actually attend. Past events are dropped unless `--include-past`.

## Content flow (frontend)

The site never hard-depends on the backend:

1. [src/content/site.js](src/content/site.js) + [src/data/events.js](src/data/events.js) — **static defaults** (also the fallback if the API is down/empty).
2. [src/lib/api.js](src/lib/api.js) — HTTP client: public loader (`loadSite`), `whatsappBookingUrl` (builds the pre-filled event reservation links), `auth` (token in localStorage), and `adminApi` (CRUD + `upload`). Maps API JSON → component shapes.
3. [src/store/content.jsx](src/store/content.jsx) — `ContentProvider` / `useContent()` loads everything once on startup.
4. Components call `useContent()`; they don't import the static files directly.

To add an editable field: add the column (migrate) → map it in `app.js` → surface it in the admin editor → consume it via `useContent()`.

## Publish gate (Coming Soon)

- Driven by `settings.published` (toggled in the admin dashboard).
- `false` → public routes render Coming Soon; `true` → full site.
- `siteConfig.fallbackPublished` in [src/config/site.js](src/config/site.js) is only used if the API is unreachable.
- Preview while unpublished: `?preview=1`.
- `/admin/*` is **never** gated, so you can always log in to publish.

## Structure

```
vercel.json                # SPA rewrite (all paths -> index.html)
WebScarping/               # Python scrapers, spawned by the API:
                           #   scrape.py + ecom_scraper/  (e-commerce products)
                           #   events_sync.py + event_sources/  (ticketing events → DB)
server/                    # Express + Postgres API (deployed to the VPS)
  src/{index,app,db,auth,migrate,seed}.js
  src/scraper.js           # /api/scrape router — spawns WebScarping/scrape.py, serves output
  README.md                # endpoints + deploy guide
  .env.example             # DATABASE_URL, ADMIN_*, JWT_SECRET, CORS_ORIGIN, PUBLIC_URL
src/
  App.jsx                  # routes: /admin/* (auth) + public site (gated)
  config/site.js           # publish fallback + isPreview()
  content/site.js          # static default copy (+ nav, CTA labels)
  data/events.js           # static default events
  lib/api.js               # HTTP client + mappers + auth + adminApi
  store/content.jsx        # ContentProvider + useContent()
  lib/flags.js              # country list + flagcdn.com flag URLs (national-team rounds)
  store/predictor.jsx       # PredictorUIProvider — shares the game modal's open state
  components/               # Layout, Navbar, Footer, Icon, EventCard, BannerSlider, CategoryTiles, StoreShowcase, HorizontalStory, SitePopup
  components/predictor/      # Basketball, BasketballButton (nav), PredictorModal (Guess the Score game)
  pages/                    # ComingSoon, Home, Events (filter by ?category=slug), EventDetail, WhatWeDo, SolutionDetail, Contact
  admin/
    useAuth.js, RequireAuth.jsx, Login.jsx, AdminLayout.jsx, ui.jsx
    components/             # FocalPicker, SpinWheel + WinnerReveal + wheelMath (Lucky Draw)
    pages/                  # SettingsEditor, BannersAdmin, SectionsAdmin, ServicesAdmin, WhatWeDoAdmin, EventsAdmin, CategoriesAdmin, StoreAdmin, StoryAdmin, PopupAdmin, PredictorAdmin, WheelAdmin, MessagesAdmin, ScraperAdmin
public/                     # ASCompanyLogo.jpg, as-store-logo.png, ticketing-box-office.png
tailwind.config.js          # brand colors, Inter font, animations
```

## Env

- Frontend (Vercel): `VITE_API_URL=https://api.yourdomain.com`
- Backend ([server/.env](server/.env.example)): DB URL, admin email/password, JWT secret, CORS origins, public URL, upload dir. Scraper (optional): `PYTHON_BIN`, `SCRAPER_DIR`, `SCRAPE_DIR`.

## Routes

Public (gated): `/`, `/what-we-do`, `/what-we-do/:slug`, `/events`, `/events/:id`, `/contact`
Admin (not gated): `/admin/login`, `/admin` (Settings), `/admin/banners`, `/admin/sections`, `/admin/services`, `/admin/what-we-do`, `/admin/events`, `/admin/categories`, `/admin/store`, `/admin/story`, `/admin/popup`, `/admin/predictor`, `/admin/wheel` (Lucky Draw), `/admin/messages`, `/admin/scraper`

The **What We Do** page (`/what-we-do`, `what_we_do` + `solutions` tables → `pages/WhatWeDo.jsx`, edited
at `/admin/what-we-do`) presents the **Absolute Solution** division: about copy, the solution tiles
(each opens `pages/SolutionDetail.jsx` at `/what-we-do/:slug`), vision & mission, and the company
divisions. The same solutions populate the homepage **What We Do** card grid (`Home.jsx`), each card
linking to its detail page. Static defaults / offline fallback live in `content/site.js`
(`whatWeDo`, `solutions`).

The homepage opens with an admin-managed **horizontal story** (`story` + `story_panels` tables → `components/HorizontalStory.jsx`, edited at `/admin/story`): a self-playing, fixed-height showcase whose panels auto-advance on a timer and travel horizontally in a loop (pauses on hover, clickable dots, typewriter heading on the active panel). Reduced-motion users get a static swipe carousel instead. Hidden until enabled with ≥1 visible panel. It is followed on the homepage by the events **BannerSlider**, then the **Hero** (whose editable copy is the "Powering connection across Lebanon since 2008…" text), then the rest of the sections.

## Brand

`tailwind.config.js`: `as-red` `#A41E22` (`.dark` `#82161A`, `.light` `#C53A3F`), `as-charcoal` `#383F41`, `as-gray` `#B6B7B8`. Font **Inter**.

## Conventions

- **Responsive first** — mobile-first Tailwind; verify ~320px → desktop.
- JPG logos on white use `mix-blend-multiply`.
- External links: `target="_blank" rel="noreferrer"`.
- The **AS Store** button is a placeholder until `settings.storeUrl` is set (renders "Coming soon" while empty).
- Event images & logo are absolute URLs returned by the API (`/uploads/...` on the VPS).
