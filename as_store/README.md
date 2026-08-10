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

## AS Points

The loyalty programme, configured at **`/admin/loyalty`** — two tabs: the deal (the rules and the
copy) and the points ledger. Customers see it at `/account/points` on the website and under Account
in the app. Defaults: **$1 spent = 1 point, 1,000 points = $50 off**.

- **Balances are the sum of a ledger**, never a stored total, so every point traces back to the order
  that paid for it. Nothing is ever edited or deleted — a correction is another row.
- **Points land when an order is delivered** by default (`confirmed` and `created` are the other
  options), and a cancellation takes them straight back. They are earned on the items subtotal after
  discounts; delivery and VAT don't earn.
- **Redeeming makes a reward, not an automatic discount.** The customer chooses how many whole
  blocks to trade; what they get is a single-use `$ off` voucher on their account, picked at
  checkout exactly like a Daily Spin reward. Voiding one in the Rewards tab returns the points.
- Changed the rate, or have orders that predate the programme? **Recalculate all orders** replays
  the earn rules over the whole history — safe to run any number of times, since it only ever writes
  the difference. Staff can also give or take points by hand, with a reason the customer sees.
- Rules live in `server/src/loyalty.js` and `db/loyalty.sql`. This page only edits them.

## Next steps (prompt by prompt)

- Category / product-detail pages (Apple PDP: full-bleed sections, sticky buy bar)
- Bag drawer / checkout
- Admin CMS ("AS Store" entry in the existing admin) + Express/Postgres backend wired via React Query

## Brand

`as-red` `#A41E22` (dark `#82161A`, light `#C53A3F`) · `as-ink` `#15181A` (text/dark) ·
`as-fog` `#F5F5F7` (light sections) · `as-charcoal` `#383F41` · `as-gray` `#B6B7B8`. Font **Inter**.
Accent links/CTAs use AS red in place of Apple's blue.
