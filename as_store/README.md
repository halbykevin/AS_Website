# AS Store

E-commerce storefront for **AS Company (Absolute Solutions SAL)** — an **Apple-style** design
(airy whitespace, big tight headlines, centered product moments, smooth motion) in AS branding.
Standalone app in its own folder so the store stays decoupled from the marketing site.

## Stack

- **Next.js 14** (App Router) + **React 18**
- **Tailwind CSS** (AS brand tokens + `as-fog` light gray + `as-ink` near-black)
- **framer-motion** — smooth animations (scroll reveals, hero entrance, pinned scroll-zoom)
- **Redux Toolkit** — client state (bag) · `react-redux`
- **TanStack React Query** — server data (product rails)
- Backend (later): **Node + Express + PostgreSQL**

> Status: **front-end UI phase.** Catalog is mock data in `src/lib/products.js` behind an async
> function that imitates the API, so the React Query wiring is real. When the backend lands, only
> `getProducts()` changes.

## Run

```bash
cd as_store
npm install
npm run dev      # http://localhost:5180
```

`npm run build` · `npm run start`

## Structure

```
next.config.mjs · tailwind.config.js · postcss.config.js · jsconfig.json (@/* -> ./src/*)
public/as-store-logo.png
src/
  app/
    layout.jsx        # root layout: Providers + Nav + Footer
    page.jsx          # homepage composition
    providers.jsx     # 'use client' — Redux Provider + React Query client
    globals.css       # tailwind + Apple-ish utilities (.shell, .pill, .link-cta, tracking-apple)
  store/
    index.js          # configureStore
    cartSlice.js      # bag state + selectors (count/total)
  lib/
    products.js       # mock catalog + hero/showcase/bento content + async getProducts()
    queries.js        # React Query hook (useProducts)
  components/
    home/HomeRow.jsx  # one homepage row: small category title + a rail of ProductTiles
    Nav.jsx           # slim translucent-dark nav; mobile full-screen menu
    Hero.jsx          # centered hero, staggered entrance
    PinnedShowcase.jsx# pinned scroll-zoom flagship (useScroll/useTransform)
    BentoGrid.jsx     # Apple "lineup" tiles, reveal-on-scroll
    ProductRail.jsx   # horizontal product carousel (React Query)
    ProductTile.jsx   # Apple Store card (colours, From $X, Add to Bag -> Redux)
    Reveal.jsx        # framer-motion scroll-reveal wrapper
    Footer.jsx        # Apple-style light-gray footer
    Icon.jsx          # inline SVG icons
```

## The homepage

The homepage is the products themselves: one horizontal rail per category, each under a small
title, between the nav and the footer. Nothing else — no hero, no marketing panels.

- **Which categories get a row** is per category, in **Categories → Show on homepage**, and they
  appear in that page's Sort order. A department pulls in its subcategories' products too. Tick
  none and the homepage falls back to the first few categories, so it is never blank.
- **The row above them** (newest arrivals, featured, or one category) and **how many products every
  row holds** are in **Settings → Homepage**.
- Rows are server-rendered from the live catalogue — the products are in the HTML, so they are
  visible to Google and there is no spinner. Only the sideways scrolling is client-side.
- A product with no photo is skipped rather than shown as an empty card, so a row asks the API for
  more products than it shows.

## Daily Spin

The mobile app's prize wheel is configured entirely from this CMS, at **`/admin/spin`** — three
tabs: the wheel (rules, copy, slices, live preview), the spin log, and the rewards people have won.
There is no storefront page: the wheel is app-only, the admin is here.

- **Slices** carry a type (`percent` / `amount` / `free_delivery` / `gift` / `none`), a `weight`
  that becomes the odds shown in the table, and optional `stock`. Anything hidden, weightless or
  sold out drops off the wheel, and the preview mirrors that exactly.
- **Rewards** are single-use vouchers bound to one account. Discount ones are picked at checkout in
  the app and reduce the order total (`orders.discount_amount` / `voucher_code`); gifts are handed
  over by staff — mark them **Handed over** in the Rewards tab. Staff can also **Grant a reward**
  directly, void one, or reactivate a spent one.
- The server owns the draw and every money rule — see `server/src/spin.js` and `db/spin.sql`. This
  page only edits them.

## Call for price

For products you may not advertise a price on (Apple hardware, typically). Switch on **Call for
price** in a product, or select several in **Products** and use the **Call for price** button — the
price disappears from the storefront and the app, and a WhatsApp button takes its place.

- The wording is one setting for the whole catalogue: **Settings → Call for price** (the label, the
  button, an optional note, and the message the customer's WhatsApp opens with — `{product}` and
  `{url}` are filled in). It messages the number under **Settings → Contact** unless you give it a
  URL to use instead.
- **The price is kept, not deleted.** It stays in the product for your own reference, for sales, and
  for switching the flag back off — but the API stops sending it to anyone who isn't signed into the
  admin, so it is absent from the page, the app, the JSON and the data Google reads.
- **These products can't be bought.** Add to Bag is replaced everywhere, and checkout refuses them
  even if one is still sitting in an old bag — the customer is told which item and why.
- They also drop out of price filters, and **sort last everywhere you browse** — Shop all, a
  category, the homepage rows, every sort option, and the app. They have no price, so left in place
  they read as $0: first under "Price: Low to High" and a wall of "Call for price" cards at the top
  of the catalogue. A *search* still ranks by relevance — someone who typed "iPad Pro" wants the
  iPad, priced or not — and the admin's own product list keeps the order you sorted it into.

## AS Wallet

Store credit, configured at **`/admin/wallet`** — two tabs: the deal (the rules and the copy) and the
wallet ledger. Customers see it at `/account/wallet` on the website and under Account in the app.
Default: **spend $1,000, get $50 back** (a 5% rate, CMS-editable).

This replaced **AS Points**. The deal is the same; the unit is the one customers already think in, so
there is nothing to convert and nothing to redeem before it can be spent. Existing points balances
were converted to credit at the old rate by `db/wallet.sql`; the `loyalty_*` tables are retained but
no longer read.

- **Balances are the sum of a ledger**, never a stored total, so every cent traces back to the order
  that earned it or the order that spent it. Nothing is ever edited or deleted — a correction is
  another row.
- **Credit lands when an order is delivered** by default (`confirmed` and `created` are the other
  options), and a cancellation takes it straight back. It is earned on the items subtotal after
  discounts; delivery and VAT don't earn, and neither does the part of an order paid with credit —
  that last rule is what stops credit breeding credit.
- **Spending happens at checkout, not here.** The balance appears as a switch on the checkout page;
  switching it on takes it off the total. It is a *payment*, not a discount, so it comes off after
  VAT — the tax is on the goods whoever's money buys them. The server claims the debit before the
  order exists, which is what stops the same balance being spent twice from two devices, and gives it
  back if the order fails or is cancelled. `min_order` and `max_percent` bound where it can be used.
- **Shoppers see it before they buy**: "Get $63.00 back in your AS Wallet" sits under the price on a
  product page and above the Place order button at checkout. Both disappear when the wallet is off,
  and both quote the exact money that will land — there are no blocks to reach.
- Changed the rate, or have orders that predate the wallet? **Recalculate all orders** replays the
  earn rules over the whole history — safe to run any number of times, since it only ever writes the
  difference. Staff can also add or take credit by hand, with a reason the customer sees.
- Rules live in `server/src/wallet.js` and `db/wallet.sql`. This page only edits them.

## Next steps (prompt by prompt)

- Category / product-detail pages (Apple PDP: full-bleed sections, sticky buy bar)
- Bag drawer / checkout
- Admin CMS ("AS Store" entry in the existing admin) + Express/Postgres backend wired via React Query

## Brand

`as-red` `#A41E22` (dark `#82161A`, light `#C53A3F`) · `as-ink` `#15181A` (text/dark) ·
`as-fog` `#F5F5F7` (light sections) · `as-charcoal` `#383F41` · `as-gray` `#B6B7B8`. Font **Inter**.
Accent links/CTAs use AS red in place of Apple's blue.
