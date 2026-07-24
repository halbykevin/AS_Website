# AS Store — Notification System

A centralized, extensible notification domain covering **transactional** (orders,
account), **promotional** (offers, campaigns), **informational** (news, events),
and **interactive** (surveys) messages across the **mobile app**, the **store web
app**, **push**, and **email**.

Everything lives under [`server/src/notifications/`](src/notifications/) plus the
`/api/**` routes it mounts. Business code never calls a provider directly — it
records an **event** and the background worker does the rest, so an order is never
blocked or failed by a notification provider.

---

## 1. Architecture

```
 Producer (order created, status changed, payment paid, admin campaign)
        │  writes a row in the SAME transaction as the business change
        ▼
 notification_events   ← transactional outbox (idempotent via dedupe_key)
        │
        ▼  worker tick (every 15s, Postgres advisory-locked)
 service.eventHandlers ── render template ──►  notifications        (inbox row, per recipient)
                                          └──►  notification_deliveries (one per channel)
        │
        ▼  worker dispatch (backoff + retry cap → dead letter)
   inapp (instant) · push (Expo HTTP API, batched) · email (SMTP)
```

- **Producers** — [`app.js`](src/app.js) order routes call `emitEvent(...)`.
- **Outbox** — `notification_events`; the worker drains it. Retries can't
  duplicate because both the event and every notification carry a **dedupe key**.
- **Service** — [`service.js`](src/notifications/service.js): the *only* module
  that writes notification/delivery rows (`createNotification`, `sendTemplate`,
  `fanoutCampaign`), enforces preferences, quiet hours, and the deep-link allowlist.
- **Worker** — [`worker.js`](src/notifications/worker.js): drains the outbox,
  promotes scheduled campaigns, dispatches deliveries, expires old ones. Guarded
  by `pg_advisory_lock`, so extra PM2 instances are safe.
- **Channels** — push via [`expoPush.js`](src/notifications/expoPush.js) (Expo
  HTTP API, no SDK); email reuses the store SMTP config.
- **Pure helpers** — [`templates.js`](src/notifications/templates.js) (render +
  allowlist), [`audience.js`](src/notifications/audience.js) (targeting → SQL).

### Reliability & security properties
- **Idempotency** — dedupe keys on events + notifications; `ON CONFLICT DO NOTHING`.
- **Retries** — exponential backoff (`60·4^(n-1)`, capped 1h), max 4 attempts →
  `dead`. Invalid Expo tokens (`DeviceNotRegistered`) revoke the device.
- **No double workers** — advisory lock + in-process re-entrancy guard.
- **Transactional isolation** — order processing only *emits an event*; a provider
  outage never fails checkout. Delivery is never claimed before the provider ok's it.
- **Deep-link allowlist** — only in-app `/paths` or `https` on allowlisted hosts;
  `javascript:`/`data:`/foreign hosts are stripped.
- **Authorization** — customer routes touch only the caller's rows; all
  `/api/admin/**` require the admin JWT (customer tokens are rejected).
- **Privacy** — no tokens/OTPs/addresses are logged. Content is snapshotted onto
  the notification row so later template edits don't rewrite history.
- **Time-zone-safe** — all times `TIMESTAMPTZ` (UTC); quiet hours computed in the
  customer's tz (default `Asia/Beirut`).

---

## 2. Data model (all in [`db/notifications.sql`](../db/notifications.sql))

| Table | Purpose |
|---|---|
| `notification_templates` | Reusable transactional message shapes (EN + optional AR, `{{vars}}`, versioned). |
| `notification_campaigns` | Admin-authored promo/news/survey sends (audience, channels, schedule, expiry). |
| `notifications` | Per-recipient inbox rows (content snapshot, read/click state, dedupe key). |
| `notification_deliveries` | One row per (notification, channel); status, attempts, backoff, provider id. |
| `device_tokens` | Expo push tokens; customer-attached or guest; revoke/cleanup. |
| `notification_prefs` | Per-customer opt-in/out per category + quiet hours. |
| `notification_events` | Transactional outbox (pending→processed→dead). |
| `surveys`, `survey_responses` | Interactive surveys; one response per customer per order. |
| `notification_audit` | Who did what (campaign sent/edited, template updated…). |

Run it: `npm run migrate` (applies `schema.sql` then `notifications.sql`, idempotent).

---

## 3. API

### Customer (Bearer customer token; each user sees only their own data)
| Method | Path | |
|---|---|---|
| GET | `/api/notifications?before=<id>&limit=` | inbox page + `unreadCount` + `nextBefore` |
| GET | `/api/notifications/unread-count` | badge count |
| POST | `/api/notifications/:id/read` · `/read-all` · `/:id/click` | read/click state |
| GET/PUT | `/api/notifications/prefs` | preference center |
| POST | `/api/devices` | register/refresh an Expo push token (optional auth: guests allowed) |
| DELETE | `/api/devices` | `mode:'detach'` (sign-out) or `'revoke'` (opt-out) |
| GET | `/api/surveys/:id` | survey definition |
| POST | `/api/surveys/:id/responses` | submit (one per customer/order) |

### Admin (Bearer admin token)
| Method | Path | |
|---|---|---|
| GET | `/api/admin/notifications/overview` | KPI tiles |
| GET/POST | `/api/admin/notifications/campaigns` | list / create |
| GET/PUT/DELETE | `/api/admin/notifications/campaigns/:id` | detail (+stats) / edit / delete |
| POST | `…/campaigns/:id/{send,schedule,pause,cancel,duplicate,test}` | lifecycle |
| POST | `/api/admin/notifications/audience/preview` | live audience size |
| GET/PUT | `/api/admin/notifications/templates[/:id]` | transactional templates |
| POST | `/api/admin/notifications/preview` | render copy with sample vars |
| GET/POST/PUT/DELETE | `/api/admin/surveys[/:id]` | survey CRUD |
| GET | `/api/admin/surveys/:id/responses` | responses |
| GET | `/api/admin/notifications/{recent,audit}` | activity / audit log |

---

## 4. Admin workflow (CMS → **Notifications**)

`/admin/notifications` has four tabs:
- **Campaigns** — compose (title/body, optional Arabic, image, deep link),
  choose channels, pick an audience (all / filtered by order history, recency,
  category interest, city / specific IDs) with a live reach estimate, preview the
  phone card, **send a test**, then **Send now** or **Schedule**. Duplicate, pause,
  cancel, and per-campaign stats (recipients, push delivered, read, clicked,
  failures, survey responses).
- **Templates** — edit the automatic order/account messages (EN + AR), toggle
  active. Edits bump the version.
- **Surveys** — build rating/choice/text questions, view responses. The newest
  active survey is auto-offered after each delivered order.
- **Activity** — recent sends with per-channel delivery chips + the audit log.

---

## 5. Mobile & web behavior

**Mobile (Expo)** — [`src/lib/notifications.jsx`](../../mobile/src/lib/notifications.jsx):
- Registers the Expo push token on launch/login; re-attaches on sign-in, detaches
  on sign-out. Android channels (`default`, `orders`); iOS permission prompt is
  **benefit-first** (explainer screen before the OS dialog).
- Handles foreground banners, background taps, and cold-start taps → validated
  deep links (`resolveDeepLink`) into products/orders/events/surveys/account.
- Inbox (`app/notifications.jsx`) with unread badge on the brand bar, mark-all-read,
  load-more. Preference center (`app/account/notifications.jsx`) with per-category
  toggles + quiet hours. Survey screen (`app/account/survey/[id].jsx`).

**Web (store)** — bell + unread badge in the nav, `/account/notifications` (inbox +
preferences), `/account/survey/[id]`. Web Push is intentionally **not** enabled
(the mobile app is the push surface); the web inbox polls for the badge.

---

## 6. Environment & provider setup

### Already works with zero new config
Push tokens register, notifications are created, the inbox works, and email uses
the **existing** store SMTP settings. In dev without credentials, push simply
no-ops (logged) and everything else functions.

### New env vars ([`.env.example`](.env.example))
| Var | Default | Purpose |
|---|---|---|
| `EXPO_ACCESS_TOKEN` | — | Optional. Set only if you enable "Enhanced push security" in Expo. |
| `NOTIFY_WORKER_INTERVAL_MS` | `15000` | Worker cadence. |
| `NOTIFY_WORKER_DISABLED` | — | `1` to run the worker in a separate process. |

Deep-link host allowlist is derived from `STORE_URL` / `STORE_PUBLIC_URL` /
`WEBSITE_URL` (falls back to `as.com.lb`).

### Production push setup (required before real device pushes)
Expo Notifications routes through **FCM (Android)** and **APNs (iOS)**. No private
keys go in this repo:
1. **EAS project** — set `expo.extra.eas.projectId` in [`mobile/app.json`](../../mobile/app.json)
   (the token call already reads it) and build with EAS.
2. **Android/FCM** — upload the FCM **service-account JSON** to EAS
   (`eas credentials`), *not* to the repo.
3. **iOS/APNs** — let EAS manage the APNs key, or upload your `.p8`.
4. Optional: create an `EXPO_ACCESS_TOKEN` and set it on the **server** only.

Nothing above is committed; the server only ever sends an Expo *push token* to
`exp.host` — never an FCM/APNs credential.

---

## 7. Testing & verification

- **Unit** — `npm test` (Node's runner) → 18 tests: rendering, allowlist, prefs,
  quiet hours, backoff, audience SQL, Expo batching.
- **Integration** (run during development against a throwaway DB) — verified the
  full outbox→notification→delivery flow, idempotency on event/campaign retry,
  preference suppression, audience targeting, guest-device push, unread/read-all,
  and outbox `processed` state. All passed; the temporary DB was dropped after.
- **Wiring** — the app boots and registers all 34 notification routes.

---

## 8. Deployment & rollback

**Deploy**
1. Pull, `cd server && npm install` (no new server deps — the worker uses `fetch`).
2. `npm run migrate` (idempotent — only adds tables, never touches existing ones).
3. Restart the API under PM2. The worker starts automatically (advisory-locked).
4. Mobile: `cd mobile && npm install` then an **EAS build** (expo-notifications is
   a native module — Expo Go can't receive remote pushes). Configure EAS
   credentials as in §6.
5. Store web: deploy as usual (Vercel); no new build config.

**Rollback**
- The feature is additive. To disable at runtime without a redeploy, set
  `NOTIFY_WORKER_DISABLED=1` and restart — events queue harmlessly until re-enabled.
- To fully remove: revert the code. The new tables can stay (they don't affect
  existing queries) or be dropped in reverse-dependency order.

---

## 9. Limitations & follow-ups

- **Web Push** not implemented (by design — mobile is the push surface). The web
  inbox polls; add a Service Worker + VAPID later if desired.
- **Email** is opt-in per campaign and reuses store SMTP; there's no unsubscribe
  link inside campaign emails yet (transactional order emails are unchanged).
- **Arabic** copy structure is in place (EN/AR columns + locale fallback); device
  locale is currently sent as `en` from mobile — wire the app's locale to switch.
- Worker is **in-process interval-based** (right-sized for one VPS). For higher
  volume, move it to its own process (`NOTIFY_WORKER_DISABLED=1` on the API) or a
  real queue; the outbox already makes that swap safe.
