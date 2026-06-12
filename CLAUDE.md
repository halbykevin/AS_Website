# AS Company Website

Website for **AS Company (Absolute Solutions SAL)** — market leader in telecommunication and electronics in Lebanon since 2008. The site showcases what AS Company does and lets visitors **reserve spots at upcoming events** (reservations powered by *Ticketing Box Office*).

## Stack

- **React 18** + **Vite 5** (`type: module`)
- **React Router 7** (`react-router-dom`) for client-side routing
- **Tailwind CSS 3** (utility-first, brand theme in `tailwind.config.js`)
- PostCSS + Autoprefixer

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |

## Publish gate (Coming Soon)

The site stays behind a **Coming Soon** page until it is published.

- Controlled by `published` in [src/config/site.js](src/config/site.js).
  - `false` → all routes render the Coming Soon page.
  - `true` → the full website is shown.
- **Preview while unpublished:** add `?preview=1` to the URL (e.g. `http://localhost:5173/?preview=1`). This is how you view/build the real site before it's live.
- Later, the **admin backend (on the VPS) will flip `published`** — likely by serving this config from an API instead of a static file.

## Structure

```
index.html                 # HTML shell, fonts, favicon, meta
src/
  main.jsx                 # React entry — mounts <App />
  App.jsx                  # Publish gate + React Router routes
  index.css                # Tailwind directives + base styles
  config/
    site.js                # publish flag + isSiteVisible() helper
  content/
    site.js                # ALL editable copy/images (brand, hero, services, store, about, contact)
  data/
    events.js              # Events list + getEventById()  (admin-editable later)
  components/
    Layout.jsx             # Navbar + <Outlet/> + Footer + scroll-to-top
    Navbar.jsx             # Sticky responsive nav w/ mobile menu + hash scrolling
    Footer.jsx             # Contact + explore links + ticketing credit
    Icon.jsx               # Inline SVG icon set
    EventCard.jsx          # Event grid card + formatDate() helper
  pages/
    ComingSoon.jsx         # Pre-launch page (logo + contact list)
    Home.jsx               # Hero, What We Do, events preview, AS Store CTA, About
    Events.jsx             # All events grid
    EventDetail.jsx        # Event details + reservation form
public/
  ASCompanyLogo.jpg        # Main brand logo
  as-store-logo.png        # AS Store logo (used in store CTA)
  ticketing-box-office.png # Ticketing Box Office logo (events/reservations)
tailwind.config.js         # Brand colors, Inter font, animations
```

## Routes

- `/` — Home (showcase)
- `/events` — all upcoming events
- `/events/:id` — event detail + reservation form
- unknown paths redirect to `/`

> Production hosting note: this is an SPA using `BrowserRouter`. The VPS web server must **fall back to `index.html`** for unknown paths so deep links like `/events/foo` work on refresh.

## Content & data: editing model

This frontend is built so the **admin panel can change everything** with minimal component changes:

- All copy/images live in [src/content/site.js](src/content/site.js).
- Events live in [src/data/events.js](src/data/events.js).
- Components only *read* from these files. When the backend is ready, swap these static exports for API responses (e.g. fetch on load) — the components stay the same.

## Backend (planned, on the VPS — not built yet)

- Admin auth + dashboard to edit logo, texts, services, events, and the publish flag.
- Reservations API. The reservation form in [src/pages/EventDetail.jsx](src/pages/EventDetail.jsx) currently fakes success; there's a `// TODO` marking where to `POST /api/reservations`.

## Brand

Defined in `tailwind.config.js`:

- `as-red` — `#A41E22` (`.dark` `#82161A`, `.light` `#C53A3F`)
- `as-charcoal` — `#383F41`
- `as-gray` — `#B6B7B8`
- Font: **Inter** (Google Fonts, loaded in `index.html`)

## Conventions

- **Responsive first** — mobile-first Tailwind breakpoints (`sm:`, `lg:`); verify from ~320px up to desktop.
- Logos that are JPGs on white use `mix-blend-multiply` to blend into the page.
- External links use `target="_blank" rel="noreferrer"`; keep `alt` text meaningful.
- The **AS Store** button is intentionally a placeholder: `store.url` is empty in `content/site.js`, so the button renders as "Coming soon". Set `store.url` once that site exists and it becomes a live link.
