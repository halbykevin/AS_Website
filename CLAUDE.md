# AS Company Website

Website for **AS Company (Absolute Solutions SAL)** — market leader in telecommunication and electronics in Lebanon since 2008. The site showcases what AS Company does and lets visitors **reserve spots at upcoming events** (reservations powered by *Ticketing Box Office*). A built-in **admin dashboard** lets staff edit all content, manage events/reservations, and run a **web scraper** that pulls product data from e-commerce pages and downloads it (JSON/CSV/Excel/HTML).

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

## Backend

See [server/README.md](server/README.md) for endpoints + full VPS/Vercel deploy steps.

Postgres tables: `settings` (single row, id=1, holds global content + the `published` flag),
`services`, `events` (each has a `ticket_url`; no price/category — cards & "Buy tickets" open
that link), `banners` (homepage slideshow: image/title/subtitle/link/active), `sections`
(admin-created homepage sections: eyebrow/heading/body/image/button/theme/visible),
`popup` (single row, id=1: a one-time announcement/ad popup —
enabled/title/body/image/link/link_label + `trigger_type` `load|scroll` with
`delay_seconds`/`scroll_percent`; `updated_at` doubles as the version the
frontend stores in localStorage to show it once),
`reservations`. Created by [server/src/migrate.js](server/src/migrate.js);
optional sample content via [server/src/seed.js](server/src/seed.js).

API responses are **camelCase**; DB columns are snake_case (mapped in [server/src/app.js](server/src/app.js)).
Public can read content + POST a reservation; everything else needs a Bearer token.

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
- The admin UI ([src/admin/pages/ScraperAdmin.jsx](src/admin/pages/ScraperAdmin.jsx)) mirrors the
  desktop GUI's options and polls the job while it runs. Downloads need the token, so the client
  fetches them as authed blobs (`downloadScrapeFile` / `downloadScrapeZip` in `lib/api.js`).
- `scrape.py` gained an `--auto <url>` mode (probe → single product vs. crawl) used by the backend;
  the existing `--url/--urls/--crawl` modes are unchanged.
- **VPS prereq:** Python 3 + `pip install -r WebScarping/requirements.txt` (and
  `playwright install chromium` only if the "JavaScript site" / `--render` option is used). Env:
  `PYTHON_BIN` (default `python3`), `SCRAPER_DIR` (default `../WebScarping`), `SCRAPE_DIR`
  (default `server/scrapes`).

## Content flow (frontend)

The site never hard-depends on the backend:

1. [src/content/site.js](src/content/site.js) + [src/data/events.js](src/data/events.js) — **static defaults** (also the fallback if the API is down/empty).
2. [src/lib/api.js](src/lib/api.js) — HTTP client: public loaders (`loadSite`, `createReservation`), `auth` (token in localStorage), and `adminApi` (CRUD + `upload`). Maps API JSON → component shapes.
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
WebScarping/               # Python e-commerce scraper (scrape.py + ecom_scraper/), spawned by the API
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
  components/               # Layout, Navbar, Footer, Icon, EventCard, BannerSlider, SitePopup
  pages/                    # ComingSoon, Home, Events, EventDetail
  admin/
    useAuth.js, RequireAuth.jsx, Login.jsx, AdminLayout.jsx, ui.jsx
    pages/                  # SettingsEditor, BannersAdmin, SectionsAdmin, ServicesAdmin, EventsAdmin, ReservationsAdmin, PopupAdmin, ScraperAdmin
public/                     # ASCompanyLogo.jpg, as-store-logo.png, ticketing-box-office.png
tailwind.config.js          # brand colors, Inter font, animations
```

## Env

- Frontend (Vercel): `VITE_API_URL=https://api.yourdomain.com`
- Backend ([server/.env](server/.env.example)): DB URL, admin email/password, JWT secret, CORS origins, public URL, upload dir. Scraper (optional): `PYTHON_BIN`, `SCRAPER_DIR`, `SCRAPE_DIR`.

## Routes

Public (gated): `/`, `/events`, `/events/:id`
Admin (not gated): `/admin/login`, `/admin` (Settings), `/admin/banners`, `/admin/sections`, `/admin/services`, `/admin/events`, `/admin/reservations`, `/admin/popup`, `/admin/scraper`

## Brand

`tailwind.config.js`: `as-red` `#A41E22` (`.dark` `#82161A`, `.light` `#C53A3F`), `as-charcoal` `#383F41`, `as-gray` `#B6B7B8`. Font **Inter**.

## Conventions

- **Responsive first** — mobile-first Tailwind; verify ~320px → desktop.
- JPG logos on white use `mix-blend-multiply`.
- External links: `target="_blank" rel="noreferrer"`.
- The **AS Store** button is a placeholder until `settings.storeUrl` is set (renders "Coming soon" while empty).
- Event images & logo are absolute URLs returned by the API (`/uploads/...` on the VPS).
