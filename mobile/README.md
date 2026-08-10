# AS Company — Mobile App

A single **React Native (Expo)** app that contains **both** halves of the AS
Company web presence:

- **AS Website** — the marketing side: Home, What We Do (Absolute Solution +
  solution details), Events (with pre‑filled **WhatsApp** reservations), and the
  _Guess the Score_ predictor game.
- **AS Store** — the full e‑commerce storefront: browse/search products, product
  details, a cart (2‑per‑item cap), **cash‑on‑delivery checkout**, customer
  **accounts** (email / WhatsApp one‑time codes), **orders** + tracking, and
  saved addresses.

It talks to the **same two Express + PostgreSQL APIs** the websites use —
nothing is re‑implemented on the server side. The app shares the AS brand
identity through one central design system so every screen looks and behaves
consistently.

> Admin/CMS stays on the web. This app is the customer‑facing experience.

---

## Quick start

```bash
cd mobile
npm install
# point the app at your two running APIs (see "Configuration")
cp .env.example .env        # then edit the two URLs for your machine's LAN IP
npx expo start
```

Open in **Expo Go** (scan the QR) or a simulator (`i` iOS / `a` Android).
Requires Node 18+ and the two backend APIs running (the AS Website API on
`:8080`, the AS Store API on `:8081`).

> On a **physical device**, `localhost` means the phone. Set the URLs to your
> computer's LAN IP (e.g. `http://192.168.1.20:8081`) so the phone can reach the
> servers. The app still renders with the APIs offline — it falls back to
> bundled default content.

---

## Configuration

Two API base URLs, resolved in this order (first wins):

1. `EXPO_PUBLIC_WEBSITE_API_URL` / `EXPO_PUBLIC_STORE_API_URL` — env vars
   (`.env`, shell, or EAS secrets).
2. `expo.extra.websiteApiUrl` / `expo.extra.storeApiUrl` in `app.json` — the
   committed defaults.

See [`src/config/env.js`](src/config/env.js).

| Concern | AS Website API                                     | AS Store API                                        |
| ------- | -------------------------------------------------- | --------------------------------------------------- |
| Default | `http://localhost:8080`                            | `http://localhost:8081`                             |
| Drives  | settings, events, what‑we‑do, solutions, predictor | products, categories, cart source, orders, accounts |

A third URL, `EXPO_PUBLIC_STORE_WEB_URL` / `expo.extra.storeWebUrl`, points at
the store **website** rather than an API. It is only used for the documents the
app links out to (privacy policy, warranty, shipping, support), so it should stay
on the real domain even in development — those pages are the public ones the app
stores review.

---

## Architecture

```
app/                         # Expo Router (file-based) routes
  _layout.jsx                #   root: providers + Stack, and the ErrorBoundary export
  (tabs)/                    #   bottom tabs (store-first): Home (storefront) ·
                             #   Shop (browse) · Bag (cart) · Events · Account
  company.jsx                #   the informative AS Company (website) page
  legal.jsx                  #   privacy policy + warranty/shipping/support links
  what-we-do/  events/       #   marketing detail screens
  product/ category/         #   store screens
  checkout  search  orders/  #   commerce flow
  account/ auth/             #   profile + OTP sign in / register
    delete.jsx               #   permanent account deletion (store requirement)
    points.jsx               #   AS Points — balance, redeem, history
  predictor.jsx              #   Guess the Score game
  spin.jsx                   #   Daily Spin wheel (winnings live at account/rewards)
src/
  theme/                     # ⭐ central design system (tokens + hooks)
  ui/                        # ⭐ primitives built on the theme (Screen, Text, Button…)
  components/                # feature components (ProductTile, EventCard, …)
    CrashScreen.jsx          #   dependency-free fallback when a route throws
  lib/                       # API clients + account + helpers
    storeApi.js  websiteApi.js  account.jsx  queries.js
    session.js                # one place to react to an expired/revoked token
    spin.js  wheel.js         # Daily Spin client + the wheel's geometry
    loyalty.js                # AS Points client (balance, redeem, history)
    format.js  whatsapp.js  storage.js
  store/                     # Redux Toolkit cart slice
  content/                   # ContentProvider (loads site content once) + defaults
  providers/AppProviders.jsx # Theme → Redux → React Query → Account → Content
  config/env.js
assets/                      # brand logos, icons
```

State mirrors the web store for parity: **Redux Toolkit** (cart, persisted to
`AsyncStorage`), **React Query** (server data cache), and a small **Account
context** holding the signed‑in customer. The customer token is stored in the
native keychain/Keystore through `expo-secure-store`; web builds use
`AsyncStorage` as a compatibility fallback.

---

## The central design system (this is the important part)

Everything visual flows from one place, so **any new component automatically
inherits the app's look**:

- **[`src/theme/tokens.js`](src/theme/tokens.js)** — the single source of truth:
  the AS brand palette (`as-red`, `as-charcoal`, the dark `as-ink` commerce
  surfaces, `as-amber`, `as-fog`), spacing, radii, typography scale, shadows and
  layout constants. Ported directly from the two web Tailwind configs.
- **[`src/theme/ThemeProvider.jsx`](src/theme/ThemeProvider.jsx)** — exposes two
  hooks:

```jsx
import { useTheme, useThemedStyles } from '@/src/theme';

function MyThing() {
  const t = useTheme(); // raw tokens + helpers (t.colors, t.spacing, t.radii…)
  const styles = useThemedStyles(makeStyles); // memoized StyleSheet built from the theme
  return <View style={styles.box} />;
}

const makeStyles = t => ({
  box: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radii['2xl'],
    padding: t.spacing.lg,
    ...t.shadows.card
  }
});
```

Because `makeStyles` receives the theme, a component written months from now
can't drift from the brand — change a token once and the whole app updates. To
add a dark theme later, pass a second color set to `buildTheme` in the provider;
nothing else changes.

- **[`src/ui/`](src/ui/)** — the primitive kit every screen uses: `Screen`
  (safe‑area + scroll + gutters + max content width), `Text` (type scale +
  weights + semantic colors), `Button` (the web `.pill` variants), `Card`,
  `Input`/`Field`, `Header`, `Badge`, `Chip`, `Icon`, `SectionHeader`,
  `Divider`, `Skeleton`, `EmptyState`. Import them from one place:
  `import { Screen, Text, Button } from '@/src/ui'`.

**Convention:** screens never hard‑code a hex or a pixel — they read tokens via
`useTheme()` / `useThemedStyles()` and compose the `src/ui` primitives.

---

## Feature parity with the web

| Web                                             | In the app                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Store catalog, categories, search, sale pricing | Store tab, `category/[slug]`, `search`, `ProductTile`                  |
| Product detail + Add to Bag (max 2)             | `product/[slug]` with gallery + sticky add‑to‑bag                      |
| Cart drawer + on‑site checkout (COD)            | `cart` + `checkout` (guest or signed‑in)                               |
| Online payment with **Whish**                   | `checkout` payment picker → hosted Whish page → `orders/[id]` confirms |
| Accounts: email/WhatsApp code, Google           | `auth/login` + `auth/register` (OTP). Google prepared — see below      |
| Orders + guest tracking, saved addresses        | `orders`, `orders/[id]` (track token), `account/addresses`             |
| Events + pre‑filled WhatsApp reservation        | Events tab, `events/[id]` → opens WhatsApp                             |
| What We Do + solution pages                     | `what-we-do` + `what-we-do/[slug]`                                     |
| Guess the Score predictor                       | `predictor` (3‑step: score → share → details)                          |
| Publish gate (Coming Soon)                      | Store tab respects `settings.published`                                |
| — _(app only)_                                  | **Daily Spin** — `spin` + `account/rewards`, see below                 |
| AS Points loyalty                               | `account/points` — balance, redeem, history (also on the website)      |

### Daily Spin

The prize wheel. It exists **only here** — there is no web storefront equivalent — but every part
of it is configured from the AS Store CMS at `/admin/spin`: the copy, the slices, their odds and
stock, the cooldown, and how long a won reward stays valid.

```
(tabs)/index  SpinBanner        ← hidden entirely unless a wheel is running
account       "Daily Spin" row + "My rewards"
   │
spin.jsx      GET  /api/spin    → the wheel, and this customer's cooldown
   │          POST /api/spin    → the server draws, records, mints the voucher
   │             └─ the app animates to the slice it was handed, then reveals
account/rewards               → every voucher won or granted
checkout      GET /api/vouchers?subtotal= → the ones that apply, with the exact discount
                POST /api/orders { voucherCode } → the server re-prices and consumes it
```

- **Signed-in only.** A reward has to belong to an account, and a cooldown means nothing without an
  identity. Signed-out visitors still see the real wheel and prizes, with a sign-in prompt where the
  spin button goes — that is what makes it worth opening.
- **The animation is a reveal, never a decision.** `POST /api/spin` returns the winning slice id
  (and the slice order it drew against); `SpinWheel.spinTo(index)` derives its final rotation from
  that. Killing the app mid-spin does not lose the prize — it is already on the account.
- **The cooldown is the server's.** `nextSpinAt` comes back with every fetch; nothing counts down
  locally, so changing the device clock achieves nothing.
- **Rewards are picked, not typed.** They are account-bound, so checkout lists the ones that apply to
  the current bag rather than asking for a code. Percentage, amount and free-delivery rewards adjust
  the total; a physical gift is fulfilled by staff and never touches checkout.
- Geometry lives in [`src/lib/wheel.js`](src/lib/wheel.js) — a deliberate copy of the store's file,
  so the admin's preview and the app's wheel land on the same slice.
- **Needs a native rebuild.** The wheel draws with `react-native-svg`; adding it changed the native
  dependency set, so ship a new build rather than an OTA update.

### AS Points

The loyalty programme — unlike the spin, it exists on the website too, and the two read the same
API. Configured from the AS Store CMS at `/admin/loyalty`; defaults to **$1 = 1 point** and
**1,000 points = $50 off**.

```
account       "AS Points" row, with the balance on it
   │
account/points  GET  /api/loyalty         → the rules, this balance, points on the way, history
   │            POST /api/loyalty/redeem  → trades whole blocks for a reward voucher
account/rewards                           → where that reward then lives
checkout      the reward is picked like any other — nothing points-specific here
```

- **Points come from orders, and the server reconciles them.** Nothing is counted on the device; the
  balance is the sum of a server-side ledger, and an order that is cancelled after delivery takes
  its points back.
- **Redeeming is always the customer's choice**, and it produces a reward they then choose to spend.
  Two deliberate steps — the screen never spends points for anyone.
- **Pure JS.** Unlike the wheel this adds no native dependency, so it ships as an OTA update.

### Paying with Whish

Same model as the web store — **the server owns the payment**, the app only
starts it and then asks how it went. The Whish secret is never in the app.

```
checkout                POST /api/orders { paymentMethod:'whish', returnUrl:'ascompany://orders' }
   │                         └─ server creates the Whish payment → { collectUrl, trackToken }
   ├─ openAuthSessionAsync(collectUrl, 'ascompany://orders')     ← in-app browser tab
   │        customer pays on Whish ─► GET /api/orders/whish/return (API re-checks + settles)
   │                                     └─ 302 ascompany://orders/<id>?placed=1&t=…
   └─ orders/[id]  → POST /api/orders/:id/reconcile ×5           ← the only source of truth
```

- **Offered only when it works.** `usePaymentMethods()`
  (`GET /api/payment/methods`) hides the option unless the API has Whish
  credentials, so checkout can never start a payment that would 400.
- **Nothing is trusted client‑side.** `placed=1` is a hint; the screen still
  asks the API to re‑check with Whish (`src/lib/payments.js` → `pollPayment`),
  and re‑checks again whenever the app returns to the foreground — covering a
  payment finished in the Whish app or a missed callback.
- **The bag survives an abandoned payment.** Unlike COD, the cart is emptied
  only once the order reads `paid`. An unpaid order keeps its `collectUrl`, so
  **Complete payment** on `orders/[id]` (and the "Payment pending" line in
  `orders`) resumes the very same payment link.
- **Deep link back:** the app sends `Linking.createURL('/orders')` —
  `ascompany://orders` in a build, `exp://<host>/--/orders` in Expo Go — and the
  API appends `/<orderId>`. The server only honours schemes in its
  `APP_RETURN_SCHEMES` allow‑list. Changing `expo.scheme` in `app.json` means
  changing that list too.
- **In Expo Go the return leg does not come back to the app**, by design: `exp`
  is not on the production allow‑list, so the API bounces to the *web* order page
  instead. The redirect carries the order's track token, and honouring an
  arbitrary scheme would hand that token to whatever URL the request asked for.
  To exercise the real return, use a preview build (real scheme) or add `exp` to
  `APP_RETURN_SCHEMES` on a **development** API only.
- Whish rejects `localhost`, so testing the flow against a local API needs a
  tunnel (`cloudflared` / `ngrok`) in `PUBLIC_API_URL`. Without the deep link
  the flow still completes — the customer closes the tab and the order screen
  polls.

### Google sign‑in on mobile

Google is a full browser round‑trip (app → API → Google → API) that **returns the
shopper to the app**, not the web storefront — same deep‑link bridge as the Whish
payment return.

```
GoogleButton  → openAuthSessionAsync(
                  /api/account/google/start?next=…&appReturn=ascompany://auth/google,
                  'ascompany://auth/google')            ← in-app browser tab
                pick Google account ─► /api/account/google/callback
                  └─ 302 ascompany://auth/google?code=…&next=…
              → tab closes itself → POST /api/account/google/mobile-exchange
              → useAccount().adoptToken(token)
              → router.replace(next)
```

- The app passes `Linking.createURL('/auth/google')` as `appReturn`; the API carries
  it inside the **signed OAuth state**, then redirects a 120-second, single-use
  authorization code there. The app exchanges that code for its customer session
  token. The web flow sends no `appReturn` and keeps returning to
  `STORE_URL/auth/google`.
- `appReturn` is re‑validated against the server's `APP_RETURN_SCHEMES` allow‑list at
  redirect time, so it can't be turned into an open redirect. A **failed** sign‑in is
  also bounced back to the app link (`?error=google`) so the browser still closes.
- No change is needed in the Google Cloud console — Google still redirects to the
  API's own `GOOGLE_REDIRECT_URI`; the API does the final hop into the app.
- Lives in [`src/lib/googleAuth.js`](src/lib/googleAuth.js) (`signInWithGoogle`) +
  `GoogleButton` in [`src/components/auth.jsx`](src/components/auth.jsx).

Email and WhatsApp one‑time codes still work out of the box against the same API.

### Sessions expire; the app notices

Customer tokens last 30 days, but they can stop working sooner — the account was
deleted, the secret rotated, the clock ran out. Every API client
(`account.jsx`, `notifications.jsx`, `spin.js`) routes a **401 on a request that
actually sent a token** through `noteAuthFailure` in
[`src/lib/session.js`](src/lib/session.js); `AccountProvider` registers the
handler and drops the session. Without it the app sat in a half–signed-in state,
showing an account whose every request failed.

The "sent a token" part matters: several endpoints are public, and signing the
customer out over a 401 from one of those is a bug that looks like a random
logout.

---

## Publishing

### Account deletion

**Account → Delete account** ([`app/account/delete.jsx`](app/account/delete.jsx))
calls `DELETE /api/account`. Both app stores require this to exist in-app before
they will list an app that creates accounts, and it is deliberately as easy to
find as sign-out rather than buried in a settings sub-screen.

The screen states what goes and what stays before asking the customer to type
`DELETE`. What stays is the order record itself — bookkeeping and warranty claims
need it — with the personal columns scrubbed server-side. An order still in
flight gets a **409** back, which the screen shows as a plain explanation.

Keep the copy here, the endpoint, and the "Deleting your account" section of the
privacy policy saying the same thing; that text is what the stores review.

### Privacy & legal

[`app/legal.jsx`](app/legal.jsx) is reachable from the account tab **signed in or
out** — the privacy policy has to be findable without an account. The documents
live on the store website (`STORE_WEB_URL` in
[`src/config/env.js`](src/config/env.js)) and open in an in-app browser tab, so
there is one canonical text rather than a copy that drifts. The same URL,
`https://store.as.com.lb/pages/privacy`, is what you give Google Play and the App
Store.

### Over-the-air updates

`expo-updates` is configured with the **`fingerprint`** runtime-version policy and
one channel per build profile (`development` / `preview` / `production` in
[`eas.json`](eas.json)).

```bash
npm run update           # JS-only fix → production channel, no store review
npm run update:preview   # same, for internal preview builds
```

Fingerprint hashes the native project, so an update is only offered to a binary
whose native side matches. Add a library with native code (as `react-native-svg`
was for the spin wheel) and the fingerprint changes — those builds simply stop
seeing the update instead of crashing on a missing native module. That case needs
a real build, not `npm run update`.

`fallbackToCacheTimeout` is **0**: the app always launches instantly from the
bundle it already has and fetches the update in the background, so a customer on
a bad connection never stares at the splash screen waiting for a download. The
trade-off is that a published fix lands on the customer's **next** launch, not the
current one. Don't raise this to "make updates apply faster" — you would be paying
for it with launch time on every single cold start, for every customer, forever.

### Error containment

The goal is that **nothing the customer does takes the whole app down**. A single
bad CMS record or one null field from the API used to be enough: React unmounts
the entire tree when a render throws and nothing catches it, and in a release
build an uncaught async error kills the process outright. Four layers now stand
between that and the customer, each catching what the one below it can't see.

| Layer | Where | Catches | Customer sees |
| --- | --- | --- | --- |
| Section | `<Boundary>` around a rail/banner/card | a render throw inside that section | a small "didn't load · Try again" card, or nothing (`fallback={null}`) |
| Screen | `export { ScreenBoundary as ErrorBoundary }` in every route file | a render throw anywhere in that screen | that screen fails, **tab bar and navigation keep working** |
| Root | `CrashScreen` exported from [`app/_layout.jsx`](app/_layout.jsx) | a throw in the layout/providers themselves | full-screen "Something went wrong · Try again" |
| Global | `installGlobalErrorHandler()`, [`src/lib/errors.js`](src/lib/errors.js) | throws **outside** render — async callbacks, timers, native modules | nothing; logged, app keeps running |

Notes worth knowing before you change any of it:

- **Boundaries only see render errors.** That's a React limit, not a choice —
  hence the global handler, which is the only thing standing between a stray
  `.then()` throw and a release build tearing the app down mid-checkout. In
  `__DEV__` it forwards everything to the default handler so you still get the
  red box; swallowing errors while building is how bugs ship.
- **`CrashScreen` is deliberately dependency-free** — no theme, no UI kit, no
  fonts. It renders precisely when something upstream is broken, so anything it
  reached for could be the broken thing.
- **The promo frame degrades rather than fails.** `GlobalPromoFrame` and
  `StorePopupModal` render above *every* screen, so no per-screen boundary can
  help if they throw. The frame's boundary falls back to the same navigator
  without the banner around it — marketing chrome is the first thing you drop.
- **Retry remounts under a new key**, because React gives you no way to
  "un-throw". Most of these errors come from data that was momentarily wrong, so
  the refetch behind the remount genuinely tends to fix it.
- **`<Boundary>` renders a keyed Fragment, not a View.** A wrapper would occupy a
  slot in a `gap` column even when its child renders nothing, leaving a hole
  wherever a section legitimately hides itself. For the same reason, put the
  Boundary *inside* a section's conditional, not around it.
- `reportError` in `errors.js` is the single funnel every layer already calls —
  if you ever wire up Sentry or similar, that's the one place it goes.

### Still needed before you can submit

- **Play service account** — a JSON key with the **Release manager** role, from
  Google Cloud → IAM → Service accounts, then granted access in Play Console →
  Users and permissions. Put it at `credentials/play-service-account.json`
  (`credentials/` is gitignored — this key can publish to your store listing) and
  run `npm run submit:android`. The submit profile uploads to the **internal**
  track as a **draft**; promote to production from the Play Console once you've
  checked the build.
- **iOS submit config** — the `submit.production` block has no `ios` section. Add
  `appleId` / `ascAppId` / `appleTeamId`, or just run `eas submit --platform ios`
  and let it prompt.
- **iOS push credentials** — only `google-services.json` (Android/FCM) is in the
  repo; an APNs key has to be uploaded to EAS before notifications work on iOS.
- **Play Data Safety form** — declare what the policy already describes: name,
  phone, email, address, order history, push tokens, device/app info; no
  advertising ID; no cross-app tracking.

> **`eas.json` takes no comments.** Unlike `package.json`, where the repo uses
> `"//key"` entries freely, EAS validates this file against a strict schema and
> refuses to run on an unknown top-level key — `eas build:list` fails with
> `"//channels" is not allowed` and every script that shells out to it dies with
> it. Explanations go here in the README instead.

---

## Scripts

```bash
npm run start      # expo start (dev server + QR)
npm run android    # open on Android
npm run ios        # open on iOS (macOS)
npm run web        # run in the browser
npm run update     # publish a JS-only OTA update to the production channel
```

## Notes

- **SDK / versions:** Expo SDK 54, React 19.1, React Native 0.81 (New
  Architecture). Requires the SDK 54 build of **Expo Go**.
- **Icons:** `@expo/vector-icons` (Ionicons), wrapped by `src/ui/Icon.jsx` which
  maps the app's semantic icon names.
- **Images:** `expo-image` via `src/components/RemoteImage.jsx` (caching +
  branded fallback).
- **App icon / splash / favicon:** all four are generated from one master,
  `assets/as-logo.jpg` (512x512, circular badge on pure `#FFFFFF`, ink spanning
  **91%** of the canvas). Keep that file as the source of truth and regenerate
  rather than hand-editing the PNGs:
  - `icon.png` (1024) and `favicon.png` (512) — full-bleed. The badge's widest
    ink sits at the edge *midpoints*, which clear iOS's squircle mask, so no
    padding is needed.
  - `adaptive-icon.png` (1024) — Android masks an adaptive foreground down to a
    centred circle of roughly **61%** of the canvas, so here the logo is scaled
    to **60%**; at full bleed the "ABSOLUTE SOLUTIONS SAL" line is cut off.
  - `splash-icon.png` (1024) — full-bleed, on the white `backgroundColor`.
    `imageWidth` is now a **single value for both platforms**: expo centres the
    logo on a 288dp canvas and hands it to Android 12's
    `windowSplashScreenAnimatedIcon`, which only shows the inner **192dp
    circle**. The old artwork was a wide lockup whose ink reached
    `0.527 x imageWidth` from centre, so it needed a smaller Android override;
    this badge is square and circular, reaching only `0.455 x imageWidth`, which
    puts the Android ceiling at **~211dp**. At 190dp the ink is 173dp — a
    comfortable margin inside the mask — so the per-platform split is gone.
    Re-measure that ratio if the artwork changes.
  - **Not** regenerated from it: `notification-icon.png`. Android renders that
    one as a flat white silhouette, so it has to stay a transparent mono glyph —
    the colour badge would come out as a white blob.
- **In-app logos** are separate from the launcher icon and unchanged:
  `as-logo-clear.png` and `as-store-logo-clear.png`, used by `AppHeader`,
  `BrandBar` and `ComingSoon`. The `-clear` suffix means "background removed";
  each has an unkeyed source of truth alongside it (`as-logo.png`,
  `as-store-logo.png`).
- Building a native binary (EAS): `npx eas build` after configuring an Expo
  account.
