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

It is a **308**, not the 307 `redirect()` gives by default — a permanent
redirect is what hands the root domain's authority to `/events` and gets that
URL indexed instead. A temporary one leaves the two competing indefinitely.

## SEO

Search is how someone finds an event they don't yet know exists, so it is a
feature here, not a chore. Everything lives in [`src/lib/seo.js`](src/lib/seo.js)
plus the `metadata` exports on each route.

- **`schema.org/Event` on every event page** is the one thing that matters most:
  it is what makes Google show the date/venue card and put the event in the
  Search and Maps *Events* experience. Copy alone cannot earn that. A multi-night
  run emits **one Event per night** sharing the page URL and differing by `@id` —
  each night is a separate thing a person searches for, and a ten-day span shown
  as one entry is wrong on every day but the first.
- **No price in `offers`.** We don't know it (the box offices price per tier and
  the sync never scrapes it) and a fabricated `0` would be a misrepresentation in
  the one place Google checks markup against reality. A missing price is a
  warning; a wrong one is a penalty.
- **`startDate` carries the local time when the free-text `time` parses**, with
  the Beirut offset computed **for that date** — the zone is +02:00 in winter and
  +03:00 in summer, and a listing an hour out is worse than one with no time.
- **Every category filter is its own indexable page.** `/events?category=<slug>`
  gets its own title, description and self-canonical, and is in the sitemap:
  somebody searching "concerts in Lebanon" should land on the concerts tab. A
  `category` that matches nothing is noindexed instead — an empty page under a
  real-sounding URL is how a listing site accumulates thin content.
- **Finished events keep their page**, marked ended and `noindex, follow`, and
  drop out of the listing and the sitemap. A 404 the morning after the show
  throws away every link the event earned and sends a searcher to an error
  instead of to what else is on. (The sync eventually prunes the row, and *then*
  it 404s — which is the right end state, just not the right same-day one.)
- **`Organization` + `WebSite` once, in the layout.** Every Event points its
  `organizer` at that `@id` rather than restating the company, so Google reads
  one publisher across a few hundred pages.
- **Inter is self-hosted via `next/font`**, not linked from fonts.googleapis.com:
  the stylesheet it replaced was render-blocking on a third-party origin, in
  front of the artwork that is the LCP on every page. Event pages are also
  pre-rendered (`generateStaticParams`) for the same reason.

**Google Search Console** verifies this property two ways, and both must stay
put: the `verification.google` token in `src/app/layout.jsx`, and
`public/googlef1358e29e1c14b07.html` — a 53-byte file whose only content is its
own name. It looks like debris; it isn't. Google re-checks the proof
periodically and silently unverifies the property if it disappears, which takes
the Events report and the sitemap submission with it.

Neither is the DNS TXT record Search Console offers first. `ticketing.as.com.lb`
is a CNAME to Vercel, and DNS forbids a name carrying a CNAME from carrying any
other record, so that TXT can never resolve — and the property must be
`https://ticketing.as.com.lb`, **not** `www.ticketing.as.com.lb`, which does not
exist in DNS at all.

The other half of this lives outside `as_ticketing/`: `as.com.lb/events` and
`/events/<slug>` **301 here** from the root `vercel.json`, and are out of that
site's `public/sitemap.xml` with them. Two domains rendering the same events
under different URLs split the ranking signals between them — which is what the
matching slugs above exist to avoid. That destination is hardcoded (a static host
can't read `settings.ticketing_url`), so if the setting is ever turned off, take
the redirect out in the same change or the marketing site will link to an
`/events` that redirects away.

## Picking seats

An event that is sold with a hall behind it gets a live seat map on its page:
the real room, what is still free, priced — you pick what you want and send it
to us on WhatsApp. **All three sources the sync pulls from are read**, and each
publishes something different to an anonymous browser, so the panel has to be
able to be three shapes without becoming three components:

| Source | What they publish | What the panel shows |
|---|---|---|
| ticketingboxoffice.com | every seat as an `<input>` in the event page | the whole hall as a grid we rebuild, plus their zone list |
| ihjoz.com | an SVG of the room + a table of what is on sale in each block | their drawing; tap a **seated** block to open its numbered seats, tap a **table** to take it whole |
| tickit.co | an SVG of the room + zones from their JSON API | their drawing and a priced zone list — see below |

**Tick'it has no seat to pick, and that is their product, not a gap in ours.**
Their own ticket note reads "free seating within your selected zone, allocated
on a first-come, first-seated basis", so the zone *is* the choice. Inventing
seat numbers to make the three look alike would be inventing a promise.

**It is a request, never a booking, and the wording has to keep saying so.**
Nothing on our side can hold a seat — only the partner's own system can. Two
visitors can tap the same seat a second apart, and a seat can sell between the
page loading and the message being sent. Staff confirm every request by hand and
come back to the customer if a seat has gone. That is the deal the business
chose, with eyes open; the UI says it under the button, and the API module says
it at the top. Do not let either start implying a confirmed seat.

- **Where it comes from**: `GET /api/events/:slug/seatmap` on the marketing
  site's API ([server/src/seatmap.js](../server/src/seatmap.js)), which routes to
  one reader per partner in `server/src/seatmap/`. It is fetched **on demand**
  from the browser, not stored: a map saved by the nightly sync would be hours
  stale, which is a worse lie than "as of a minute ago". The API caches each hall
  for a minute so a page being read by ten people costs one fetch.
- **The partner's drawing is served, not redrawn** — for the two that have one.
  A room of 82 numbered tables is meaningless as a list of names, and where V12
  sits is the whole question being asked. That means third-party markup in our
  DOM, so [server/src/seatmap/svg.js](../server/src/seatmap/svg.js) strips it to
  an **allow-list** of shapes and attributes: no `<script>`, no `on*`, no
  `xlink:href`, no `url()` in a style, no ids to collide with ours — only
  `data-sid`, which is how a block is addressed. Interactivity is all ours.
- **A block's seats are loaded when it is opened**, from
  `…/seatmap/sections/:sid`. One ihjoz hall has six seated blocks; fetching all
  of them with the map would be 200 KB for a map most visitors pick one zone
  from.
- **A run's nights are separate halls**, and a day can hold two of them — one
  stand-up run plays 6pm and 9pm on the same Saturday, as two separate events at
  the partner. So the night selector sends the date **and the time**, and clears
  whatever was picked: those seats were in a different room.
- **Nothing renders until the answer arrives** — not even a skeleton. Most events
  on all three sites have no hall at all (a club night sells one kind of ticket),
  so a panel that says "Choose your seats" and then removes itself would promise
  a seat picker to almost everyone who will never get one.
- **The map fits first, then zooms.** You cannot choose a seat in a room you
  can't see, so it opens scaled to the container and the +/− buttons zoom in for
  tapping. The rebuilt grid's geometry is computed from the data (widest row ×
  seat size) rather than measured after a paint.
- `SEATMAP_ENABLED=0` on the API turns the whole thing off — the kill switch for
  the day a partner objects or redesigns, and every page falls back to the
  reserve button on its own. `SEATMAP_SOURCES=tbo,ihjoz` turns off one source
  without turning off the rest.

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
