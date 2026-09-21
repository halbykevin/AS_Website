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
                             #   Shop (the catalog itself) · Bag (cart) ·
                             #   Events · Account
  company.jsx                #   the informative AS Company (website) page
  legal.jsx                  #   privacy policy + warranty/shipping/support links
  what-we-do/  events/       #   marketing detail screens
  product/ category/         #   store screens (category = the Shop tab's
                             #   CatalogScreen, scoped to one department)
  checkout  search  orders/  #   commerce flow
  assistant.jsx              #   the AS Store shopping assistant (chat)
  account/ auth/             #   profile + OTP sign in / register
    delete.jsx               #   permanent account deletion (store requirement)
    wallet.jsx               #   AS Wallet — balance, how it works, history
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
    wallet.js                 # AS Wallet client (balance, history, earn estimates)
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
| Shopping assistant (the site's chat bubble)     | `assistant` — sparkles button in the store header, same endpoint       |
| Publish gate (Coming Soon)                      | Store tab respects `settings.published`                                |
| — _(app only)_                                  | **Daily Spin** — `spin` + `account/rewards`, see below                 |
| AS Wallet store credit                          | `account/wallet` — balance + history; spent at checkout (also on web)  |

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

### AS Wallet

Store credit — unlike the spin, it exists on the website too, and the two read the same API.
Configured from the AS Store CMS at `/admin/wallet`; defaults to **spend $1,000, get $50 back**.
It replaced AS Points: same deal, told in money, with nothing to redeem first.

```
account       "AS Wallet" row, with the balance on it
   │
account/wallet  GET /api/wallet          → the rules, this balance, credit on the way, history
   │
checkout      GET  /api/wallet?total=    → how much of the balance THIS order may take
              POST /api/orders { useWallet: true }
                 └─ the server claims the debit, re-prices, and gives it back if anything fails
```

- **Credit comes from orders, and the server reconciles it.** Nothing is counted on the device; the
  balance is the sum of a server-side ledger, and an order that is cancelled after delivery takes
  its credit back — as well as returning whatever credit it spent.
- **The app asks for the wallet, never for an amount.** `useWallet: true` lets the server decide what
  the rules allow; the client only renders the figure that comes back. A checkout that computed its
  own number could disagree with the order it places.
- **Spending is always the customer's choice** — a switch at checkout, never applied for them.
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

### Sign in with Apple (iOS)

Required, not optional: App Store Review Guideline **4.8** says an app offering a
social login must also offer one that lets the customer keep their email address
private, and Google sign-in is what triggers it. So the button sits **above**
Google on both auth screens — 4.8 also asks for equal prominence — and it is
Apple's own native control (`AppleAuthenticationButton`), because the mark, the
wording and the proportions are fixed and a lookalike is a rejection.

- **Nothing like the Google round-trip.** iOS presents the sheet, hands back an
  identity token, and the app POSTs it to `/api/account/apple`. No browser, no
  deep link, no one-time code.
- **The server verifies the signature**, unlike Google's id_token — that one
  arrives from Google's own endpoint over TLS, this one arrives from whoever can
  reach the API. [`apple.js`](../as_store/server/src/apple.js) checks it against
  Apple's published keys and pins the issuer and the bundle id, with a per-attempt
  nonce against replay. `test/apple.test.js` covers each way that can be attacked.
- **Recognition is by `customers.apple_sub`, never by email.** Apple sends the
  name and email on the *first* authorization only, and Hide My Email gives a
  relay address that was never the customer's anywhere else. The email is used
  the one time it arrives, so an Apple sign-in lands on the account the customer
  already had here rather than starting a second one.
- **Deleting an account revokes the grant** — Apple requires it of an app that
  offers both. It needs a Sign in with Apple key (`APPLE_TEAM_ID` / `APPLE_KEY_ID`
  / `APPLE_PRIVATE_KEY`); without one, sign-in and deletion both still work and
  only the message to Apple is skipped.
- Lives in [`src/lib/appleAuth.js`](src/lib/appleAuth.js) + `AppleButton` /
  `useAppleAuthAvailable` in [`src/components/auth.jsx`](src/components/auth.jsx).
  The button renders nothing off iOS, and the hook exists so a caption or divider
  beside it can't disagree about whether it is there.

### The App Review demo account

App Store and Play reviewers must be able to sign in, and our sign-in posts a code
to an inbox or a WhatsApp number they do not have. `REVIEW_EMAIL` + `REVIEW_CODE`
on the store API make **one** address accept **one** fixed code, with nothing sent
and the request rate limit skipped so a reviewer cannot lock themselves out.

The code is **exactly six digits, enforced** — the app's code field strips
anything else and caps at six on a number-pad keyboard, so a longer code is one a
reviewer cannot type and the server refuses to enable the account rather than let
that turn into a rejection. Six digits skip the per-code attempt cap, so the path
carries its own: ten wrong codes from one IP, then fifteen minutes. It only ever
matches the email channel, the comparison is constant-time, and the server logs a
warning at boot while it is live — **unset both once the app is approved.** Lives
in [`otp.js`](../as_store/server/src/otp.js) with the two OTP routes in `app.js`.

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

## The shopping assistant

The sparkles button in the store header opens `app/assistant.jsx` — the same
assistant as the website's chat bubble, and deliberately **a client of it**: it
POSTs to `<store website>/api/chat`, the storefront route that owns the system
prompt, the catalog tools, the tool-round budget, the rate limit and the API key.

- **Not ported, called.** A second copy in the store API would mean two prompts
  to keep in step and a second place to leak a key from. The route takes a plain
  JSON body with no cookies and no auth, and React Native's fetch has no browser
  origin, so there is nothing for a mobile client to be missing.
- **Products come back as whole catalog rows**, so they render as real
  `ProductTile`s — live price, working Add to Bag, the fly-to-bag animation. The
  model never hands over a price to print; only slugs its tools looked up. They
  go through `mapChatProduct` so the photos are rebased onto the API host the app
  is pointed at.
- **A screen, not a floating bubble.** On a phone a bubble lands either on the
  tab bar or on a product tile, and this is the one feature that can use the
  whole viewport.
- **The button is the website bubble's green** (`#25D366` — `theme.colors.assistant`,
  the same `chat-green` as `as_store/tailwind.config.js`) rather than the header's
  own white. One feature, one colour, whichever screen a customer meets it on —
  and on a bar of plain white nav icons the green is what says this one is
  different. `assistantOnLight` is the darkened twin for light chrome, since the
  bright green on white is barely a contrast at all.
- If the storefront has no model key configured, the route answers 503 with its
  own wording and the screen shows it. The button is not hidden — the app has no
  way to know before asking.

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

### DEX optimization (R8)

`expo-build-properties` turns R8 on for release builds. Without it the Android
template's `minifyEnabled` defaults to **false** and the whole ~30 MB of DEX ships
unobfuscated and unshrunk — which is what Play Console flagged on bundle 20 (1.1.0):
*"DEX code optimization is below our threshold — Obfuscation (1%)"*, fix by
**Feb 2027**, because a category under 25% "may impact your visibility and publishing
capabilities".

```jsonc
["expo-build-properties", { "android": {
  "enableMinifyInReleaseBuilds": true,          // minifyEnabled - obfuscate + shrink code
  "enableShrinkResourcesInReleaseBuilds": true  // drop unreferenced resources
}}]
```

- **`enableMinifyInReleaseBuilds`, not `enableProguardInReleaseBuilds`.** The old name
  still works (the plugin maps it forward) but is deprecated, and the new one is the key
  the SDK 54 template's `app/build.gradle` actually reads.
- **It is a native change, so no OTA can carry it.** `npm run update` cannot ship this;
  the fingerprint runtime version moves with it, which is exactly what stops an update
  built after the change reaching a binary built before it.
- **R8 renames classes, and reflection only breaks in release.** React Native and the
  Expo modules ship their own consumer rules and the template already keeps Reanimated
  and the turbomodules, so nothing here needed hand-written rules — but a minified build
  has to be walked by hand before it goes up: `npm run apk:prod` (`production-apk`
  extends `production`, so it minifies too). Sign in, check out, spin the wheel
  (`react-native-svg`), add to bag (the Reanimated flight), open a notification, take an
  update. Anything that does need a keep rule goes in the plugin's `extraProguardRules`,
  which is appended to `proguard-rules.pro`.
- **Crash reports stay readable.** AGP writes `mapping.txt` into the bundle's metadata,
  so Play deobfuscates stack traces itself — there is nothing extra to upload.
- Play reports *Obfuscation* and *Optimization* as separate percentages, and the template
  passes `proguard-android.txt` rather than the `-optimize` variant. If the optimization
  figure is still low after the next upload, that is the next lever. The
  **R8 configuration → "Upgrade to AGP version 9.0"** note is not ours to act on: Expo
  SDK 54 pins AGP 8.

### Still needed before you can submit

- **Play service account** — a JSON key with the **Release manager** role, from
  Google Cloud → IAM → Service accounts, then granted access in Play Console →
  Users and permissions. Put it at `credentials/play-service-account.json`
  (`credentials/` is gitignored — this key can publish to your store listing) and
  `npm run play` does the rest. The submit profile uploads to the **internal**
  track as a **draft**; promote to production from the Play Console once you've
  checked the build. `npm run play` refuses to start a build until that file is
  there and prints these steps — a key discovered missing after a 20-minute
  build has cost 20 minutes and a build credit.
- **The app's first upload has to be manual.** Google's Play Developer API
  cannot create a brand-new app's first release, so if nothing has ever been
  uploaded for `lb.com.as.company`, run `npm run aab` and drag that file into
  the console once. Every release after it can come from `npm run play`.
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

npm run apk        # build + install a test APK on a phone (see scripts/apk.mjs)
npm run aab        # build the Play Store bundle, print its download link
npm run aab -- --download # ...and keep the file in mobile/build/ too
npm run aab -- --latest   # skip the build, print the newest bundle's link

npm run play         # build the bundle AND upload it to Play (internal, draft)
npm run play:latest  # upload the newest finished bundle, no rebuild
npm run play:live    # same, but the production track (still a draft)
```

From the repo root, `npm run app` is `npm run aab` and `npm run app:test` is
`npm run apk` — both forward their flags (`npm run app -- --latest`).

### Releasing to Google Play

```bash
# 1. bump the version people see (the versionCode is remote — EAS increments it)
#    mobile/app.json  ->  expo.version
# 2. one command, from the repo root or from mobile/
npm run app            # == cd mobile && npm run aab
# 3. wait (~15 min). It prints the bundle's expo.dev link and copies it to the
#    clipboard. Open it, the browser saves the .aab.
# 4. play.google.com/console > AS Company > Create new release > upload > roll out.
```

**It gives you a link, not a file.** The `.aab`'s next stop is a file picker in
a browser, so the browser is the sensible thing to fetch it — it does the 60 MB
faster than this script will, and you are already sitting in front of it to do
the upload. The link is EAS's own artifact URL and lives about a month; the
script prints the expiry date next to it.

- `--download` pulls the file into `mobile/build/` **as well**, and opens that
  folder with it selected — for an archive copy, a machine with no browser, or
  Play's internal app sharing. `--no-open` leaves the folder alone. A finished
  build's artifact never changes, so a copy already on disk is not fetched twice.
- `--latest` skips the build entirely and prints the newest finished bundle's
  link. This is the one to use when a build finished and you closed the window.

`npm run app:test` is the same script for the *testing* APK, which does download
— it ends up installed on a connected phone over adb. An `.aab` cannot be
installed on a phone at all; Play builds the per-device APKs out of it.

#### Or let it upload too

```bash
npm run play           # build, download, and submit to Play
npm run play:latest    # submit the newest finished bundle, no rebuild
npm run play:live      # production track instead of internal (still a draft)
```

`npm run play` is `scripts/apk.mjs --profile production --submit`: the same build
and download as `npm run aab`, with an `eas submit` leg on the end. Three things
about it are deliberate:

- **It uploads as a draft**, and to the internal track. Nothing this script does
  can put a build in front of a customer — rolling out stays a decision someone
  makes in the console, looking at the release. `npm run play:live` swaps the
  track for `production` (the `live` submit profile in `eas.json`) and is still a
  draft.
- **It submits the build off EAS** (`eas submit --id <build>`), so the artifact
  goes from EAS to Google without passing through this machine at all — no
  download, and none of the 60 MB back up your line.
- **The credential check happens first**, before the build starts, because the
  fix is a key out of two consoles and not something you want to discover 20
  minutes in.

A JS-only change needs none of this — `npm run update` reaches the binaries
already installed. A native or dependency change needs the real build.

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
