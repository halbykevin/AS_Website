# Google Merchant Center Readiness

**Store:** `https://store.as.com.lb`

Storefront: Next.js 15 (App Router) on Vercel. Catalogue API: Express + PostgreSQL at
`https://store-api.as.com.lb` (`as_store/server`, PM2 `as-store-api`). Product images are served
from the API host under `/uploads`. There is no separate mobile database — the app reads the same
API, so everything below applies to both.

## Status

**READY WITH WARNINGS**

Nothing blocks submission. Every rule the owner confirmed on 2026-08-21 is implemented, published
and tested; the feed, the structured data and the product page agree on every price, availability
and identifier; and the checkout charges exactly what the policy pages promise. The warnings are
data-quality gaps (no barcodes yet, 150 products with no description) and a handful of return-process
details nobody has decided — none of which prevent a Merchant Center account from being opened and a
feed from being accepted.

---

## Confirmed Business Rules

Confirmed by the store owner, 2026-08-21. These are what the site now says and what the checkout now
does.

| Rule | Value | Where it is enforced |
| --- | --- | --- |
| Target country | Lebanon | Merchant Center setting |
| Currency | **USD** | `orders.currency = 'USD'`; no LBP path exists anywhere |
| Delivery estimate | **2–5 days** | Stated on `/pages/shipping` and `/pages/terms` |
| Delivery under $100 | **$5.00** | `deliveryFeeFor()`, `settings.delivery_fee` |
| Delivery at $100 or more | **Free** | `deliveryFeeFor()`, `settings.free_delivery_over` |
| **Exactly $100** | **Free** — the threshold is inclusive | `subtotal >= freeOver`, verified end to end |
| Return window | **3 days from delivery** | `/pages/shipping#returns`, `/pages/terms` |
| Opened items | **Still refundable inside the window** | `/pages/shipping#returns` |
| After 3 days | **No refund** | `/pages/shipping#returns`, `/pages/terms` |
| VAT | **11%, added at checkout, never in the displayed price** | `vatAmountFor()`, `settings.vat_percent` |

---

## Implemented

### This pass

- **`identifier_exists` is no longer inferred** (see *Product identifiers* below). The single most
  important correction in this pass.
- **`/pages/shipping` rebuilt as a code-backed page**
  ([`src/components/ShippingReturns.jsx`](as_store/src/components/ShippingReturns.jsx)) — delivery
  estimate 2–5 days, the fee and threshold **derived from `settings`**, an explicit statement that
  exactly $100 ships free, and an explicit statement that VAT is *not* in the displayed price.
- **Returns policy rewritten to the confirmed 3-day rule** on the same page, including that an opened
  product is still refundable inside the window and that there is no refund after it, plus how to
  start a return using the store's real contact channels.
- **New Terms & Conditions page** at `/pages/terms`
  ([`src/components/TermsConditions.jsx`](as_store/src/components/TermsConditions.jsx)), built only
  from behaviour the code demonstrably has, settings-derived figures, and the owner's confirmed
  rules. Linked from the footer and listed in the sitemap.
- **Both pages are code-backed on purpose.** Every money figure on them is read from the same
  `settings` row the checkout reads, so the policy cannot drift from the till. Tests assert the
  figures are never hardcoded.
- **Admin Pages list now badges code-backed slugs** ("Built in code"), so nobody edits `shipping` in
  the CMS and wonders why the site did not change.
- **Sitemap** gained `/pages/shipping` and `/pages/terms` as always-present entries.
- **Footer** gained a Terms link.
- **Auditor** (`npm run check-feed`) gained identifier-coverage reporting **grouped by brand** — the
  enrichment queue.
- **Seed content** updated: the stale "24-72 hours / 7 days" copy is gone, and the stale
  `store@ascompany.com` placeholder is gone (see *Business identity*).
- **Tests**: 54 storefront + 39 API. New coverage for identifiers, the shipping threshold, VAT, and
  the published policy text.

### Previous pass (retained, not regressed)

- `src/lib/merchant.js` — Merchant eligibility, availability, price, identifiers, URLs. Pure.
- `src/lib/merchantFeed.js` — the RSS/XML builder, escaping, per-item error containment.
- `src/app/google-merchant.xml/route.js` — the public feed endpoint.
- `scripts/check-merchant-feed.mjs` — the auditor.
- `products.gtin` / `products.mpn` columns + mod-10 check-digit validation on write + admin editor
  fields.
- `GET /api/products?images=all` so the feed can carry additional images.
- `robots.txt` on the API host allowing `Googlebot-Image` on `/uploads/`.
- **Three bug fixes:** the Product JSON-LD no longer publishes `mpn: product.id`; the per-product
  "Call for price" toggle now saves on edit (it was mapped to the wrong column and silently ignored);
  hidden/delisted products now 404 instead of serving live, indexable, add-to-bag pages.

---

## Feed

| | |
| --- | --- |
| Endpoint | `https://store.as.com.lb/google-merchant.xml` |
| Format | RSS 2.0 + `http://base.google.com/ns/1.0` |
| Content-Type | `application/xml; charset=utf-8` |
| Auth | none — public, as Googlebot requires |
| Products in catalogue | **1,733** |
| **Eligible offers** | **1,519** |
| Excluded | **214** |
| — call for price (deliberate) | 58 |
| — no description and no tagline | 150 |
| — no image | 14 |
| — price ≤ 0 | 2 |
| — (10 fail on more than one count) | |
| Duplicate ids / URLs | 0 / 0 |
| Non-HTTPS images | 0 |
| Offers carrying additional images | ~75% (max 7 extra) |

Attributes emitted: `g:id` · `g:title` · `g:description` · `g:link` · `g:image_link` ·
`g:additional_image_link` · `g:availability` · `g:price` · `g:sale_price` (only on a genuine
markdown) · `g:condition` · `g:brand` · `g:gtin` · `g:mpn` · `g:product_type`.

`g:id` is `products.id`, the SERIAL primary key — stable across price, stock, description and slug
changes. Eligibility is decided by `merchantEligible()` in `src/lib/merchant.js`, which returns
`{ eligible, reasons[] }`: public, stable id, real landing page, not call-for-price, positive numeric
price, at least one absolute image, a title and a description.

If the catalogue comes back empty (API down), the route answers **503** rather than serving an empty
feed, because an empty feed delists every offer in the account.

**Caching:** the route is `force-static` + `revalidate = 3600`, prerendered and served from
Vercel's edge, and purged by `/api/revalidate` on every admin save. Both exports are needed —
Next 15 makes route handlers dynamic by default, and a dynamic response is one Vercel will not
CDN-cache. Measured in production before the fix: **21 s per request**, every request, re-fetching
5.7 MB from an API whose full-catalogue query takes ~32 s. After: served from cache in
**~0.03 s**. Building while the API is down does not freeze a 503 at the edge — Next declines to
prerender a non-200 and falls back to dynamic for that build, then self-heals.

---

## Product identifiers

**`identifier_exists: no` is no longer sent — for any product.**

The previous implementation inferred it from an empty `gtin`/`mpn` column. That was wrong, and worth
stating plainly: `identifier_exists: no` is a claim about the **product** ("the manufacturer assigned
none"), not about our database ("nobody has typed one in"). An Apple laptop has a barcode whether or
not we hold it. Declaring otherwise is a false statement *and* it tells Google to stop trying to
match the offer to the real product — the opposite of what the attribute is for.

What happens now:

| Case | Emitted |
| --- | --- |
| **A** — genuine GTIN | `g:brand`, `g:gtin` (+ `g:mpn` if held). No `identifier_exists`. |
| **B** — no GTIN, genuine brand + MPN | `g:brand`, `g:mpn`. No `identifier_exists`. |
| **C** — neither in our database | Brand only. **`identifier_exists` omitted entirely.** Product stays in the feed; the gap is an auditor warning, never an exclusion. |
| **D** — product genuinely has no manufacturer identifier | `identifier_exists: no` — **only** from an explicit declaration. |

Case D is currently unreachable: no column distinguishes "unknown" from "genuinely none", and per the
brief no admin field was added for it. `feedItem()` writes the element only when an offer carries an
explicit `identifierExists === false`, which nothing sets. The branch and its test exist for the day a
column does.

Never done, and asserted by tests: internal product id as MPN, internal SKU as GTIN, fabricated
barcodes, model names converted into MPNs.

### Coverage (production, 1,519 eligible offers)

| | Count |
| --- | --- |
| With a GTIN | **0** |
| Without a GTIN | 1,519 |
| With an MPN | **0** |
| Without an MPN | 1,519 |
| With both | 0 |
| With neither (submitted anyway) | 1,519 |
| Declared as genuinely having no identifier | 0 |
| Missing brand | 56 |

**Enrichment queue — offers missing both identifiers, by brand:**

```
   154  Mars Gaming        45  Seagate            30  Huawei
   119  Logitech           40  Microsoft          26  Wacom
    98  Apple              39  Ubiquiti           23  Promate
    91  Hp                 37  Samsung
    88  Lenovo             32  Belkin             … and 151 more brands
    83  Green Lion         56  (no brand)
```

Regenerate any time with `npm run check-feed -- --api https://store-api.as.com.lb --brands 30`.

The columns and the admin fields exist and validate the check digit, so this is data entry, not
development. Start at the top of that list.

---

## Price / VAT

> **Merchant feed price = the displayed base USD product price.
> 11% VAT is calculated and displayed separately during checkout and is never added to the Merchant
> feed price, the JSON-LD price, or the price on the product page.**

Verified on a live render of a $2,890 product: the page shows `$2,890`, the feed says
`2890.00 USD`, the JSON-LD says `"price": "2890.00"`. The VAT-inclusive figure ($3,207.90) appears
nowhere, and the word "VAT" appears nowhere on a product page.

| Surface | Shows |
| --- | --- |
| Product page | base USD price |
| `g:price` / `g:sale_price` | base USD price |
| JSON-LD `Offer.price` | base USD price |
| Cart line item | base USD price |
| Checkout merchandise subtotal | base USD prices |
| Checkout | Subtotal · Delivery · **VAT (11%)** · Total — each on its own line, **before** the order is placed |

### The existing VAT calculation, recorded not changed

`vatAmountFor()` in `server/src/app.js`, applied in `POST /api/orders`:

```
taxable base = (items subtotal − item discounts) + (delivery fee − delivery waived)
vat          = round(base × 11%, 2)
total        = subtotal + delivery fee + vat − discount
```

So **delivery is part of the taxable base** and **discounts reduce it**. That was already the rule; it
was not altered, and it is now pinned by tests so it cannot change silently.

The **free-delivery threshold** is measured on the **pre-discount items subtotal** — also existing
behaviour, also now pinned.

### Authority

The server is authoritative and the client cannot influence it. `POST /api/orders` accepts only
`{ productId, qty }`, re-reads every price from the database, and reads the fee, threshold and VAT
rate from the live `settings` row. Verified by posting an order to a local development database with
a forged `price`, `subtotal` and `total` in the request body: the server returned the correct
figures and ignored every client-supplied number. The storefront's `deliveryFeeFor()` /
`vatAmountFor()` in `src/lib/orders.js` exist only to *show* the figures pre-order; a test runs both
implementations over the same table so they cannot disagree.

**No language claiming VAT is included exists anywhere in the codebase.** A test sweeps every file
under `src/components`, `src/app` and `src/lib` for it on every run.

---

## Shipping

| Order subtotal | Delivery |
| --- | --- |
| Under $100 | **$5.00** |
| **Exactly $100** | **Free** |
| Over $100 | **Free** |

Estimated delivery: **2–5 days** across Lebanon.

**The exactly-$100 case was already decided by the code** and required no business input. Both the
storefront summary and the server that actually charges use `subtotal >= freeOver`, so $100 ships
free. The policy page now states this explicitly ("An order of exactly $100 ships free — the
threshold is inclusive") rather than leaving a shopper to guess which side of "over $100" they fall.
A test pins the boundary; flipping `>=` to `>` fails three tests.

Verified end to end against a local development database:

| Subtotal | Delivery | VAT | Total |
| --- | --- | --- | --- |
| $99.00 | $5.00 | $11.44 | $115.44 |
| **$100.00** | **$0.00** | $11.00 | **$111.00** |
| $5,780.00 | $0.00 | $635.80 | $6,415.80 |

(Note the natural consequence of any hard threshold: a $99 order costs more than a $100 one. Normal
for free-shipping thresholds, not a defect.)

`g:shipping` is deliberately **not** in the feed. "Free over $100" is an order-total rule that a
per-item attribute cannot express faithfully, and Merchant Center's account-level shipping supports
the threshold natively. Values to enter are in *Merchant Center Values* below.

---

## Returns

Published at **`https://store.as.com.lb/pages/shipping#returns`** (public, no login, linked from the
footer, canonical, indexable, in the sitemap).

- **3 days from the day the order is delivered** to request a return and refund.
- **Opening the product does not lose that right** — an unboxed, tried item is still eligible as long
  as the request arrives inside the window.
- **After 3 days, no refund.** A later fault is a warranty matter, and the page links to the warranty
  page to say so.
- **How to start one:** contact us within the 3 days with the order number, via the store's real
  WhatsApp / email / phone / contact form (all read from `settings`).

The superseded "7 days … in original condition" wording is gone. "Original condition" was dropped
deliberately: it contradicts the confirmed rule that an opened product is refundable.

Nothing was invented. There is no restocking fee, no unopened-only rule, no seal requirement, no
category exclusion, no return-shipping charge and no exchange-only clause on the page — a test
asserts each of those phrases is absent. The page says the team will confirm how to return the item
and how the refund is issued, which is true and commits to nothing undecided.

---

## Policies

| Page | URL | Status |
| --- | --- | --- |
| Contact | `/pages/contact`, `/contact` | OK — form + WhatsApp, footer-linked |
| About | `/pages/about` | OK — footer-linked |
| Shipping | `/pages/shipping` | **Rewritten** — 2–5 days, settings-derived fees, footer-linked |
| Returns / refunds | `/pages/shipping#returns` | **Rewritten** — 3-day window |
| Warranty | `/pages/warranty` | OK — "12-month warranty unless otherwise stated" |
| Terms & Conditions | `/pages/terms` | **New** — footer-linked, in the sitemap |
| Privacy Policy | `/pages/privacy` | OK — footer-linked |
| Checkout | `/checkout` | OK — HTTPS, Subtotal / Delivery / VAT / Total shown before ordering |

### Business identity

The public site is **consistent**: `orders@as.com.lb` is the address rendered on
`/pages/contact`, `/contact`, `/pages/about`, the footer and the Organization JSON-LD, and it is also
`SMTP_USER` and `ORDERS_NOTIFY_TO` on the server. **This is the active ecommerce address** — no
business input needed.

`store@ascompany.com` was never rendered anywhere; it existed only in an unused CMS row body and in
`db/seed.sql`. Both have been cleared so the contradiction cannot resurface.

Phone `+961 79 123 272` and "Zgharta, Lebanon" come from `settings` and are used consistently.

---

## Crawling

| Check | Status |
| --- | --- |
| `robots.txt` (storefront) | OK. `Allow: /`; only `/admin`, `/account`, `/auth`, `/checkout`, `/login`, `/register`, `/search`, `/api` disallowed. Product pages, policy pages, the feed and the sitemap are all crawlable. |
| `robots.txt` (image host) | OK. `store-api.as.com.lb` explicitly allows `/uploads/` for `*` and `Googlebot-Image`, and disallows the JSON API. |
| Images | 200, correct `Content-Type` (webp / png / jpeg — all Merchant-supported), 24h cache, no auth. Sampled 40: **none below 500 px**; typical 1000×1000. |
| Canonicals | Self-referential on every product page; explicit on the new policy pages. |
| Robots meta | `index, follow`, `max-image-preview:large`. No accidental `noindex`. |
| 404 handling | Nonexistent slugs 404. **Hidden products 404** (fixed last pass). |
| Sitemap | `https://store.as.com.lb/sitemap.xml` — 1,454+ URLs, all absolute HTTPS, no admin/checkout/account/search, hidden products excluded, now including `/pages/shipping` and `/pages/terms`. Purged on admin saves. |
| HTTPS | Storefront, API and images. |
| Mobile | `width=device-width, initial-scale=1`, mobile-first Tailwind. |

---

## Analytics / Ads

Already in place. Nothing added, nothing duplicated, no fake IDs.

| | Status |
| --- | --- |
| Google Tag Manager | Not used — gtag.js loaded directly |
| Google Analytics 4 | **Live** — `G-HVDQE4SMTB`, admin-editable |
| Google Ads conversion tracking | **Wired, not configured** — conversion ID and labels are empty |
| `dataLayer` | Yes — events queued before gtag.js loads |
| `view_item` / `add_to_cart` / `begin_checkout` / `purchase` | All present |
| `purchase` payload | `transaction_id` (order id, so Google dedupes), `value`, `currency`, `shipping`, `tax`, full `items[]` |

No customer name, phone, email or address is sent. Abstraction: `src/lib/analytics.js`.

**To connect Google Ads after Merchant Center:** paste the conversion ID and per-action labels into
**Admin → Settings → Marketing tags**. `adsConversion()` starts firing immediately — no deploy.

---

## BUSINESS INPUT REQUIRED

Only genuinely unresolved items. Everything else on this page is settled.

**Return process details** — the policy says the team will confirm these when a customer contacts
them, which is honest but vague. Decide them and they can be published:

1. **Who pays return shipping** — customer, or AS Store?
2. **Refund payment method** — cash, bank/OMT transfer, reversal to the card for Whish payments,
   store credit?
3. **Refund processing time** — how many days after the item is back?
4. **Restocking fee** — is there one? (Assumed none; nothing invented.)
5. **Non-returnable categories** — any at all? (Assumed none.)

**Business identity**

6. **Full registered/public street address.** Only "Zgharta, Lebanon" is on record; Merchant Center
   asks for a full street address in the business details.

**Merchant Center shipping configuration**

7. **Handling time vs. transit time split.** The owner gave one overall estimate (2–5 days). Google's
   shipping setup asks for the two separately. Nothing in the business's records defines the split,
   so it was not invented — decide it when filling in the Merchant Center form.
8. **Order cut-off time** — the daily time after which an order is handled the next working day.
   Optional in Merchant Center; not defined anywhere in the application.

**Legal (optional, for the Terms page)**

9. Governing law / jurisdiction, limitation of liability, and the company's commercial registration
   number were deliberately omitted from `/pages/terms` rather than invented. The page is complete and
   publishable without them; add them if a lawyer supplies the wording.

---

## Deployment

**Do not deploy until you authorise it.** The order below matters.

### 1. Backend first — it runs the migration

```bash
cd as_store/server
npm run deploy
```

`deploy.sh` fingerprints `as_store/db/*.sql`, sees `schema.sql` changed, takes a `pg_dump`, runs
`npm run migrate`, restarts PM2 `as-store-api` and health-checks `/api/health`. The migration adds
`products.gtin` and `products.mpn` — both `ADD COLUMN IF NOT EXISTS … NOT NULL DEFAULT ''`, so
nothing existing is touched and a failed health check rolls the code back.

This step also ships the API's `robots.txt`, the `?images=all` gallery flag, the GTIN validation and
the "Call for price" persistence fix.

### 2. Storefront second

```bash
git push <your-branch>     # Vercel builds from the connected branch
```

Order matters: the storefront reads `gtin`/`mpn` from the API and omits them while absent, so
deploying it first breaks nothing — the feed simply carries no identifiers until the API is up.

### Optional tidy-up after deploying

The CMS still holds `shipping` and (after seeding) `terms` rows whose body text is no longer
rendered. They are harmless; the admin now badges them **Built in code**. Delete them in
**Admin → Pages** if you prefer a clean list.

---

## Production Verification

Run immediately after deploying.

### Feed

```bash
curl -sI https://store.as.com.lb/google-merchant.xml | head -3
#   expect: HTTP/2 200  ·  content-type: application/xml; charset=utf-8

cd as_store
npm run check-feed -- --url https://store.as.com.lb/google-merchant.xml
#   expect: ~1,519 offers, well-formed: yes, exit code 0
#   expect: 0 duplicate ids, 0 nonnumeric_price, 0 non_https_image
```

### Product pages

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://store.as.com.lb/product/<a-visible-slug>   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://store.as.com.lb/product/<a-hidden-slug>    # 404
curl -s -o /dev/null -w "%{http_code}\n" https://store.as.com.lb/product/not-a-real-slug    # 404
```

Then open and confirm, for each of these:

- **A normal in-stock item** — price visible, Add to Bag active, JSON-LD price == `g:price`.
- **An item with `&` in the title** — feed parses, title reads correctly.
- **A call-for-price item** — no price on the page, no price in the JSON-LD, **absent from the feed**.
- **An item with a GTIN** (once one is entered) — `g:gtin` present, **no** `g:identifier_exists`.
- **An item without a GTIN** — brand present, **no** `g:identifier_exists`, still in the feed.
- **A hidden item** — 404, absent from the feed and the sitemap.

There is no out-of-stock item to inspect: stock is not tracked (see below), so every eligible offer
is `in_stock` and the store will honour it.

### Policies

Open each and confirm the live text:

```
https://store.as.com.lb/pages/shipping   Delivery 2–5 days · under $100 = $5 · $100 or more = free
                                         · exactly $100 = free · VAT 11% not included in the price
https://store.as.com.lb/pages/shipping#returns   3-day window · opened items eligible · none after
https://store.as.com.lb/pages/terms      exists, footer-linked, VAT stated as separate
https://store.as.com.lb/pages/privacy    200
https://store.as.com.lb/pages/warranty   200
```

```bash
curl -s https://store.as.com.lb/sitemap.xml | grep -E "pages/(shipping|terms)"
curl -s https://store-api.as.com.lb/robots.txt      # allows /uploads/
```

### Checkout

Add one item under $100 and one order over $100 to the bag and go to `/checkout`.
**Do not place a real paid order.** Confirm the summary shows, on separate lines:

```
Subtotal        <sum of base product prices>
Delivery        $5.00   (or "Free" at $100 or more)
VAT (11%)       <11% of subtotal + delivery>
Total           <the three added up>
```

and that the item prices match the product pages exactly.

---

## Merchant Center Values

```
Website:            https://store.as.com.lb
Target country:     Lebanon
Feed URL:           https://store.as.com.lb/google-merchant.xml
Feed format:        RSS 2.0 (scheduled fetch)
Feed language:      English
Currency:           USD
Fetch frequency:    Daily

Delivery estimate:  2–5 days
Shipping cost:      $5.00 USD under $100.00
                    Free at $100.00 USD or more (exactly $100 ships free)
Handling/transit split: BUSINESS INPUT REQUIRED

VAT:                11%, calculated and shown separately at checkout.
                    NOT included in the feed price or the displayed product price.

Return window:      3 days from delivery
Return policy URL:  https://store.as.com.lb/pages/shipping
Terms URL:          https://store.as.com.lb/pages/terms
Privacy URL:        https://store.as.com.lb/pages/privacy
Contact URL:        https://store.as.com.lb/pages/contact

Business name:      AS Company (Absolute Solutions SAL)
Support email:      orders@as.com.lb
Support phone:      +961 79 123 272
Business address:   BUSINESS INPUT REQUIRED (only "Zgharta, Lebanon" on record)
```

**Website verification:** use the DNS or HTML-file method. Avoid the "existing Google Analytics tag"
method — the GA4 tag loads via `next/script` after hydration, which the verifier sometimes cannot
see.

---

## Known limitations, stated plainly

- **Stock is not tracked.** `products.stock` exists but is `0` for every row, checkout does not check
  it, and `POST /api/orders` accepts any visible product. Every eligible offer is therefore
  `in_stock`, which is accurate — the store will take the order. If items start selling out,
  `availabilityOf()` in `src/lib/merchant.js` is the one function to wire to real inventory.
- **150 products have no description at all** and are excluded from the feed. Several are high-value
  (MacBook Air, RTX 5070, RTX 5050). Writing copy for them is the biggest single win available.
- **Zero GTINs and zero MPNs.** Not a blocker — the feed no longer misdeclares them — but coverage is
  what makes Shopping ads competitive. See the enrichment queue above.
- **The announcement bar reads "Prices may change daily."** The feed is purged on every admin save
  and is at most an hour old otherwise, so it keeps up; expect the occasional price-mismatch notice
  if prices really do move daily.
- **`npm run lint` is unconfigured** in this repo (`next lint` prompts to set ESLint up). No lint
  system was added for this task. The lint/type step inside `next build` is the effective check and
  it passes.

---

## How to re-check any of this

```bash
cd as_store

npm test                                   # 54 tests: feed, structured data, policy content
npm run check-feed                         # audit, built from the local API
npm run check-feed -- --api https://store-api.as.com.lb          # against production data
npm run check-feed -- --url https://store.as.com.lb/google-merchant.xml
npm run check-feed -- --brands 30          # the identifier enrichment queue
npm run check-feed -- --list missing_brand # name the products behind a warning
npm run check-feed -- --json               # machine-readable summary

cd server && npm test                      # 39 tests: GTIN validation, shipping threshold, VAT
```

`check-feed` exits non-zero only on a defect Google would reject the feed over — malformed XML,
duplicate ids, a non-numeric price, an invalid availability, a malformed URL. Missing brands and
GTINs are warnings, because they are data to gather, not bugs.
