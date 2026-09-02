# AS Ticketing Hub — `ticketing.as.com.lb`

The events platform for AS Company: what's on across Lebanon, gathered from every
box office. Next.js 15 (App Router) + Tailwind, deployed on Vercel as a **third
project on this repo** (root directory `as_ticketing`).

## It has no backend

This app has no database, no API and no admin of its own. Everything it shows
comes from the **marketing site's** API — the same one `as.com.lb` reads:

```
GET /api/events   GET /api/categories   GET /api/settings
```

Events are managed once, at `as.com.lb/admin`, and the events sync (three
ticketing sites → Postgres, see the repo's CLAUDE.md) keeps them current for
both properties at once. That is why there is a `src/lib/api.js` here and no
`server/`: a second copy of the sync, or a second admin, would be two things to
keep in step for no gain.

The store is the opposite case — products, orders, customers and the wallet
exist nowhere else, so `as_store` earns its own API. Ticketing does not.

## URLs match the marketing site on purpose

`/events` and `/events/<slug>` use the **same slugs** as `as.com.lb/events`,
because both read the same rows. That is what lets `as.com.lb/events` 301 here
one-to-one later without dumping existing links, shares and search results on a
homepage. Don't change the slug scheme without changing it there too.

`/` redirects to `/events`: the platform *is* its events, and a separate
homepage would just compete with the listing for the same search term.

## Running it

```bash
npm install
npm run dev        # http://localhost:5181
```

Point it at an API with `NEXT_PUBLIC_API_URL` (see `.env.example`). With no
`.env.local` it falls back to `http://localhost:8080`, i.e. the marketing site's
API running locally — start that with `npm run dev` in `server/`.

`npm run kill` at the repo root stops this along with every other dev server.

## The logo

`public/Logo/logo.png` is the artwork as supplied: a square, stacked lockup —
ticket mark above "Ticketing Hub" — on a white card. Three things are derived
from it, and `src/components/Brand.jsx` explains why:

| File | What it is | Used by |
|---|---|---|
| `public/as-ticketing-hub-logo.png` | the lockup, card padding trimmed | footer, social preview |
| `public/as-ticketing-hub-mark.png` | just the ticket mark | header |
| `src/app/icon.png`, `apple-icon.png` | the mark, square, transparent | favicon / home screen |

The header does **not** use the stacked lockup: at 34px the wordmark would be
about four pixels tall. It relays the same elements horizontally — the mark,
then "Ticketing Hub" as live text in the brand face.

The chrome is light because the artwork is a light-background asset. A dark
header would frame it in a white box. If a transparent or knock-out version
ever arrives, that constraint goes away.

To replace any of it, drop a new file at the same path — nothing reads the
originals at runtime.

## Deploying

Vercel builds it on push to `main`, like the other two. Nothing in `deploy.sh`
touches this app — that script only deploys the two Node APIs to the VPS.

**The API must allow this origin**: `https://ticketing.as.com.lb` has to be in
`CORS_ORIGIN` in `server/.env` on the VPS. Server-rendered pages call the API
from Vercel's servers (where CORS does not apply), but anything that ever
fetches from the browser will fail without it.
