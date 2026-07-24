# AS Company — Mobile App

A single **React Native (Expo)** app that contains **both** halves of the AS Company web presence:

- **AS Website** — the marketing side: Home, What We Do (Absolute Solution + solution details), Events (with pre‑filled **WhatsApp** reservations), and the *Guess the Score* predictor game.
- **AS Store** — the full e‑commerce storefront: browse/search products, product details, a cart (2‑per‑item cap), **cash‑on‑delivery checkout**, customer **accounts** (email / WhatsApp one‑time codes), **orders** + tracking, and saved addresses.

It talks to the **same two Express + PostgreSQL APIs** the websites use — nothing is re‑implemented on the server side. The app shares the AS brand identity through one central design system so every screen looks and behaves consistently.

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

Open in **Expo Go** (scan the QR) or a simulator (`i` iOS / `a` Android). Requires Node 18+ and the two backend APIs running (the AS Website API on `:8080`, the AS Store API on `:8081`).

> On a **physical device**, `localhost` means the phone. Set the URLs to your computer's LAN IP (e.g. `http://192.168.1.20:8081`) so the phone can reach the servers. The app still renders with the APIs offline — it falls back to bundled default content.

---

## Configuration

Two API base URLs, resolved in this order (first wins):

1. `EXPO_PUBLIC_WEBSITE_API_URL` / `EXPO_PUBLIC_STORE_API_URL` — env vars (`.env`, shell, or EAS secrets).
2. `expo.extra.websiteApiUrl` / `expo.extra.storeApiUrl` in `app.json` — the committed defaults.

See [`src/config/env.js`](src/config/env.js).

| Concern | AS Website API | AS Store API |
| --- | --- | --- |
| Default | `http://localhost:8080` | `http://localhost:8081` |
| Drives | settings, events, what‑we‑do, solutions, predictor | products, categories, cart source, orders, accounts |

---

## Architecture

```
app/                         # Expo Router (file-based) routes
  _layout.jsx                #   root: providers + Stack
  (tabs)/                    #   bottom tabs (store-first): Home (storefront) ·
                             #   Shop (browse) · Bag (cart) · Events · Account
  company.jsx                #   the informative AS Company (website) page
  what-we-do/  events/       #   marketing detail screens
  product/ category/         #   store screens
  checkout  search  orders/  #   commerce flow
  account/ auth/             #   profile + OTP sign in / register
  predictor.jsx              #   Guess the Score game
src/
  theme/                     # ⭐ central design system (tokens + hooks)
  ui/                        # ⭐ primitives built on the theme (Screen, Text, Button…)
  components/                # feature components (ProductTile, EventCard, …)
  lib/                       # API clients + account + helpers
    storeApi.js  websiteApi.js  account.jsx  queries.js
    format.js  whatsapp.js  storage.js
  store/                     # Redux Toolkit cart slice
  content/                   # ContentProvider (loads site content once) + defaults
  providers/AppProviders.jsx # Theme → Redux → React Query → Account → Content
  config/env.js
assets/                      # brand logos, icons
```

State mirrors the web store for parity: **Redux Toolkit** (cart, persisted to `AsyncStorage`), **React Query** (server data cache), and a small **Account context** holding the signed‑in customer (token in `AsyncStorage`).

---

## The central design system (this is the important part)

Everything visual flows from one place, so **any new component automatically inherits the app's look**:

- **[`src/theme/tokens.js`](src/theme/tokens.js)** — the single source of truth: the AS brand palette (`as-red`, `as-charcoal`, the dark `as-ink` commerce surfaces, `as-amber`, `as-fog`), spacing, radii, typography scale, shadows and layout constants. Ported directly from the two web Tailwind configs.
- **[`src/theme/ThemeProvider.jsx`](src/theme/ThemeProvider.jsx)** — exposes two hooks:

```jsx
import { useTheme, useThemedStyles } from '@/src/theme'

function MyThing() {
  const t = useTheme()                       // raw tokens + helpers (t.colors, t.spacing, t.radii…)
  const styles = useThemedStyles(makeStyles) // memoized StyleSheet built from the theme
  return <View style={styles.box} />
}

const makeStyles = (t) => ({
  box: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radii['2xl'],
    padding: t.spacing.lg,
    ...t.shadows.card,
  },
})
```

Because `makeStyles` receives the theme, a component written months from now can't drift from the brand — change a token once and the whole app updates. To add a dark theme later, pass a second color set to `buildTheme` in the provider; nothing else changes.

- **[`src/ui/`](src/ui/)** — the primitive kit every screen uses: `Screen` (safe‑area + scroll + gutters + max content width), `Text` (type scale + weights + semantic colors), `Button` (the web `.pill` variants), `Card`, `Input`/`Field`, `Header`, `Badge`, `Chip`, `Icon`, `SectionHeader`, `Divider`, `Skeleton`, `EmptyState`. Import them from one place: `import { Screen, Text, Button } from '@/src/ui'`.

**Convention:** screens never hard‑code a hex or a pixel — they read tokens via `useTheme()` / `useThemedStyles()` and compose the `src/ui` primitives.

---

## Feature parity with the web

| Web | In the app |
| --- | --- |
| Store catalog, categories, search, sale pricing | Store tab, `category/[slug]`, `search`, `ProductTile` |
| Product detail + Add to Bag (max 2) | `product/[slug]` with gallery + sticky add‑to‑bag |
| Cart drawer + on‑site checkout (COD) | `cart` + `checkout` (guest or signed‑in) |
| Online payment with **Whish** | `checkout` payment picker → hosted Whish page → `orders/[id]` confirms |
| Accounts: email/WhatsApp code, Google | `auth/login` + `auth/register` (OTP). Google prepared — see below |
| Orders + guest tracking, saved addresses | `orders`, `orders/[id]` (track token), `account/addresses` |
| Events + pre‑filled WhatsApp reservation | Events tab, `events/[id]` → opens WhatsApp |
| What We Do + solution pages | `what-we-do` + `what-we-do/[slug]` |
| Guess the Score predictor | `predictor` (3‑step: score → share → details) |
| Publish gate (Coming Soon) | Store tab respects `settings.published` |

### Paying with Whish

Same model as the web store — **the server owns the payment**, the app only starts it and then asks
how it went. The Whish secret is never in the app.

```
checkout                POST /api/orders { paymentMethod:'whish', returnUrl:'ascompany://orders' }
   │                         └─ server creates the Whish payment → { collectUrl, trackToken }
   ├─ openAuthSessionAsync(collectUrl, 'ascompany://orders')     ← in-app browser tab
   │        customer pays on Whish ─► GET /api/orders/whish/return (API re-checks + settles)
   │                                     └─ 302 ascompany://orders/<id>?placed=1&t=…
   └─ orders/[id]  → POST /api/orders/:id/reconcile ×5           ← the only source of truth
```

- **Offered only when it works.** `usePaymentMethods()` (`GET /api/payment/methods`) hides the option
  unless the API has Whish credentials, so checkout can never start a payment that would 400.
- **Nothing is trusted client‑side.** `placed=1` is a hint; the screen still asks the API to re‑check
  with Whish (`src/lib/payments.js` → `pollPayment`), and re‑checks again whenever the app returns to
  the foreground — covering a payment finished in the Whish app or a missed callback.
- **The bag survives an abandoned payment.** Unlike COD, the cart is emptied only once the order reads
  `paid`. An unpaid order keeps its `collectUrl`, so **Complete payment** on `orders/[id]` (and the
  "Payment pending" line in `orders`) resumes the very same payment link.
- **Deep link back:** the app sends `Linking.createURL('/orders')` — `ascompany://orders` in a build,
  `exp://<host>/--/orders` in Expo Go — and the API appends `/<orderId>`. The server only honours
  schemes in its `APP_RETURN_SCHEMES` allow‑list. Changing `expo.scheme` in `app.json` means changing
  that list too.
- Whish rejects `localhost`, so testing the flow against a local API needs a tunnel
  (`cloudflared` / `ngrok`) in `PUBLIC_API_URL`. Without the deep link the flow still completes — the
  customer closes the tab and the order screen polls.

### Google sign‑in on mobile

Email and WhatsApp one‑time codes work out of the box against the existing API. **Google** is a full browser round‑trip that currently returns the shopper to the *web* storefront (`STORE_URL/auth/google`). To finish it in the app:

1. Add a mobile redirect on the store API that returns the token to the app's deep link (scheme `ascompany://auth/google#token=…`).
2. Register that redirect URI in the Google console.
3. Have the app open the flow with `expo-web-browser`'s `openAuthSessionAsync` and call `useAccount().adoptToken(token)` on return.

The button is already wired to open the web flow (`src/components/auth.jsx` → `GoogleButton`); only the return trip needs the server change.

---

## Scripts

```bash
npm run start      # expo start (dev server + QR)
npm run android    # open on Android
npm run ios        # open on iOS (macOS)
npm run web        # run in the browser
```

## Notes

- **SDK / versions:** Expo SDK 54, React 19.1, React Native 0.81 (New Architecture). Requires the SDK 54 build of **Expo Go**.
- **Icons:** `@expo/vector-icons` (Ionicons), wrapped by `src/ui/Icon.jsx` which maps the app's semantic icon names.
- **Images:** `expo-image` via `src/components/RemoteImage.jsx` (caching + branded fallback).
- Building a native binary (EAS): `npx eas build` after configuring an Expo account.
