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

## Next steps (prompt by prompt)

- Category / product-detail pages (Apple PDP: full-bleed sections, sticky buy bar)
- Bag drawer / checkout
- Admin CMS ("AS Store" entry in the existing admin) + Express/Postgres backend wired via React Query

## Brand

`as-red` `#A41E22` (dark `#82161A`, light `#C53A3F`) · `as-ink` `#15181A` (text/dark) ·
`as-fog` `#F5F5F7` (light sections) · `as-charcoal` `#383F41` · `as-gray` `#B6B7B8`. Font **Inter**.
Accent links/CTAs use AS red in place of Apple's blue.
