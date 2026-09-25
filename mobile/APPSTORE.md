# App Store submission — AS Company (iOS)

Everything App Store Connect asks for, in the order its sidebar asks for it.
Values here are taken from the real app and the live sites, not invented.

| | |
|---|---|
| App Store Connect app | **AS Company** — Apple ID `6813355139` |
| Bundle ID | `lb.com.as.store` (iOS) — the Android package stays `lb.com.as.company` |
| Expo project | `ascompanylb1/as-company-mobile` (`d4b13079-b3bf-42e1-8edf-cb9aed914ec6`) |
| App version | **1.1.1** (`mobile/app.json`), matching the record |

---

## 0. Blockers — do these before the metadata is worth filling in

0. ~~Bundle ID mismatch~~ — **settled.** The App Store Connect record is
   `lb.com.as.store` and `lb.com.as.company` was never registered as an App ID,
   so the App Information dropdown had nothing else to offer. The app now builds
   `lb.com.as.store` (`app.json` → `ios.bundleIdentifier`) instead, which cost
   one line and kept the record, its Apple ID and its screenshots.
   **The two stores therefore carry different identifiers on purpose**: Android
   stays `lb.com.as.company`, which is already published on Play and must never
   change. Nothing depends on them matching — deep links use the `ascompany://`
   scheme and push uses a team-wide APNs key — with one exception:
   `APPLE_BUNDLE_ID` in the store API (default `lb.com.as.store`) is what an
   identity token's audience is checked against, so **if the iOS id ever changes
   again, that constant changes with it or every Apple sign-in is rejected.**
1. **Sign in with Apple — done, ships in the next build.** *(Decided: implement
   it rather than hide Google.)* See §12. Nothing left in the app; the optional
   revocation key is a portal step.
2. **Demo account for App Review — built, needs two env vars.** *(Decided:
   build it rather than lean on Sign in with Apple.)* Set `REVIEW_EMAIL` and
   `REVIEW_CODE` in the store API's `.env` and that address signs in with that
   fixed code, with nothing sent anywhere. See §7.
3. ~~APNs key~~ — **done 2026-09-21.** Key `J2AYTZVG37` created in the portal and
   uploaded to EAS; iOS push works from this build on.
4. **iPad screenshots.** *(Decided: keep iPad support.)* `supportsTablet: true`
   stays, so App Store Connect requires iPad 13" screenshots — and the screens
   need to be genuinely looked at on an iPad first. A phone layout stretched to
   13 inches is a Guideline 4.0 rejection.
5. ~~No iOS build~~ — **done 2026-09-21.** Build **4** (version 1.1.1,
   `40eee5ec`) built on EAS and submitted to App Store Connect. Signed with
   hand-made credentials, no Apple login — see §9.

---

## 1. App Information

| Field | Value |
|---|---|
| Name (30) | `AS Company` |
| Subtitle (30) | `Tech store, events & rewards` |
| Privacy Policy URL | `https://store.as.com.lb/pages/privacy` |
| Primary category | **Shopping** |
| Secondary category | **Entertainment** |
| Content rights | **"Yes, it contains third-party content, and I have the necessary rights."** The app shows supplier product photography, brand names and logos, event artwork from the promoters, and the Whish mark — "No" would be false. Note what you are attesting to: catalogue photos arrive through the scraper from the source shops, and event posters belong to the promoters, so the permission has to actually exist. |
| Age Suitability URL | optional, leave blank |
| Age rating | see §5 |
| Primary language | English (U.S.) |

---

## 2. Version information (the page you are on)

### Promotional text (170 max — editable any time, no new version)

```
Over 1,200 electronics in stock, cash on delivery across Lebanon, credit back on every order with AS Wallet, a daily prize spin — and the events worth going to.
```

### Description (4,000 max)

```
AS Company puts everything we do in Lebanon into one app: our electronics store, the events we power, and the divisions behind them. Absolute Solutions SAL has been a market leader in telecommunication and electronics in Lebanon since 2008.

SHOP OVER 1,200 PRODUCTS
Computers & Gear, Mobiles & Accessories, Audio & Video, Gaming & Consoles and more. Search the whole catalogue, sort by price or what's new, and filter by brand, category and availability. Prices are shown before VAT, which is added at checkout.

PAY THE WAY THAT SUITS YOU
Cash on delivery anywhere we deliver in Lebanon, or pay online with Whish Pay. Card details are entered on Whish's own secure page — we never see them.

AS WALLET — CREDIT BACK ON WHAT YOU BUY
Every delivered order credits your AS Wallet, and the credit comes straight off a later order. No points to convert, no codes to remember: it is dollars, and you see exactly what each order earned before you place it.

DAILY SPIN
One spin a day for discounts, free delivery and gifts. What you win lands in your account as a reward you can use at checkout.

TRACK EVERY ORDER
Follow an order from confirmed to delivered, keep your delivery addresses saved for next time, and get a notification when the status changes.

ASK THE SHOPPING ASSISTANT
Describe what you need in plain words — a laptop for university, headphones under a budget — and get real products from our catalogue, with live prices and one tap to add them to your bag.

WHAT'S ON IN LEBANON
Concerts, comedy, theatre and festivals, with dates, venues and full details. Found something? Reserve it over WhatsApp in one tap — the message is written for you.

GUESS THE SCORE
Predict the final score, share your pick, and get a draw ticket for the prize.

ABOUT AS COMPANY
Read what our divisions do — telecommunication, electronics, security and integrated solutions — and what we have built in Lebanon since 2008.

YOUR ACCOUNT, YOUR CALL
Sign in with Apple, with Google, or with a one-time code — whichever you prefer. Keep your addresses and order history in one place, choose which notifications you want, and delete your account from inside the app whenever you like.

Questions? https://store.as.com.lb/pages/support
```

> The sign-in line is accurate as of the Sign in with Apple work (§11): iOS
> offers Apple, Google and the one-time code. Keep it in step if a method is
> ever added or dropped — App Review reads the description against the app.

### Keywords (100 max, comma-separated, no spaces after commas)

```
electronics,lebanon,beirut,phones,laptops,gaming,headphones,delivery,shopping,tickets,cashback
```

Words already in the name and subtitle (`AS Company`, `store`, `events`,
`rewards`) are indexed anyway — don't spend keyword characters repeating them.

### URLs, version, copyright

| Field | Value |
|---|---|
| Support URL | `https://store.as.com.lb/pages/support` |
| Marketing URL | `https://www.as.com.lb` |
| Version | `1.1.1` — already set on the record; it must match the build's version string |
| Copyright | `2026 Absolute Solutions SAL` |
| Routing App Coverage File | leave empty (not a maps app) |
| App Clip / iMessage App | leave collapsed |

---

## 3. Screenshots

Required for this app, at these exact pixel sizes, RGB, **no alpha channel**:

| Set | Sizes accepted | Needed |
|---|---|---|
| iPhone 6.5" | 1242 × 2688 or 1284 × 2778 (portrait) | 3–10 (first 3 show on the install sheet) |
| iPad 13" | 2064 × 2752 or 2048 × 2732 | required — `supportsTablet` stays `true` |

You are on Windows, so there is no simulator: install the build through
**TestFlight on a real iPhone**, screenshot there, and resize the PNGs to the
size above. Suggested six, in this order:

1. Home — the storefront rows
2. Shop — the catalogue grid with the filter toolbar
3. A product page showing "get $N back"
4. Bag / checkout with cash-on-delivery + Whish
5. Daily Spin wheel
6. Events list

---

## 4. App Privacy (must be complete before you can submit)

Answer for **the app only** — the website's Google Analytics is not part of this.

**Privacy Policy URL** (top of the page, currently empty):
`https://store.as.com.lb/pages/privacy`. Leave *User Privacy Choices URL* blank —
that one is for "do not sell / share my data", and we don't sell data.

Eight data types. Every one is **Linked to the user**, and **none** is used for
tracking (no advertising identifier, nothing shared with data brokers, so no ATT
prompt and no `NSUserTrackingUsageDescription`):

| Data type | Purposes to tick |
|---|---|
| Contact Info → Name | App Functionality |
| Contact Info → Email Address | App Functionality |
| Contact Info → Phone Number | App Functionality |
| Contact Info → Physical Address | App Functionality **+ Developer's Advertising or Marketing** |
| Purchases → Purchase History | App Functionality **+ Developer's Advertising or Marketing** |
| Identifiers → User ID | App Functionality + Developer's Advertising or Marketing **+ Analytics** |
| Identifiers → Device ID (the push token) | App Functionality + Developer's Advertising or Marketing **+ Analytics** |
| User Content → Other User Content (order notes, assistant messages) | App Functionality |

Why the marketing and analytics ticks, which are easy to get wrong:
`notifications/audience.js` targets promo campaigns by **order history, ordered
category and city** (`customers.address` / `orders.city`), so those data types are
used to decide who receives marketing. `notifications.read_at` / `clicked_at`
record whether a push was opened, per customer — that is the Analytics purpose on
the two identifiers. Promotional pushes to our own customers using our own data
are **not** "tracking" in Apple's sense, so that answer stays No.

**Not collected:** Health, Financial Info (Whish takes the payment on its own
page — we only receive whether it succeeded), Location, Contacts, Browsing
History, Search History, Usage Data, Diagnostics, Sensitive Info.

> `device_tokens` rows exist for **signed-out** devices too (guest tokens still
> receive broadcast promos until the device opts out), so the push token counts
> as collected even before anyone signs in. Declare it either way.

**The privacy policy has to say all of this.** Apple compares the declaration
against the page at the privacy URL. `PrivacyPolicy.jsx` covers push tokens and
offers, but not that we choose who gets an offer from their order history and
city, nor that we record whether a notification was opened. Add both sentences
there in the same change as this form.

**Not collected:** Health, Financial Info (Whish takes the payment on its own
page — we only receive whether it succeeded), Location, Contacts, Browsing
History, Search History, Usage Data, Diagnostics, Sensitive Info.

**Tracking: No.** The app uses no advertising identifier and does not track
across other companies' apps — so no ATT prompt and no
`NSUserTrackingUsageDescription`.

All of this matches `as_store/src/components/PrivacyPolicy.jsx`, which is what
Apple reads at the privacy URL. Anything new the app starts collecting has to be
added in both places in the same change.

---

## 5. Age rating

Answer the questionnaire honestly; the answers that matter here:

- **Profanity or crude humor, horror/fear themes, alcohol/tobacco/drug
  references → Infrequent**, not None. The Events tab shows the partners'
  listings word for word, and a scan of the live feed on 2026-09-25 (74 events)
  found them: a stand-up night called "Shits and Giggles", "Open Bar — Regular
  Spirits" and beer prizes in 16 descriptions, 17 Parties & Clubbing nights,
  "The Haunted Building" and a Halloween edition. A reviewer who opens Events
  sees that, and a questionnaire saying None is another 2.3.6.
- Violence, sexual content, **gambling**, medical/treatment info → **None**.
  (The Daily Spin is free, costs nothing to enter and pays out store credit — it
  is not gambling and it is not a loot box, since nothing chance-based is ever
  purchased.)
- **Contests / sweepstakes → Yes, infrequent/mild.** The Daily Spin and Guess the
  Score are contests. Declare them — this typically lands the app at 12+/13+.
- Unrestricted web access → **No** (the app opens only our own pages, Whish and
  WhatsApp).
- User-generated content / user-to-user chat → **No** (the assistant is a bot,
  and nothing a customer writes is shown to another customer).
- Social Media → **No**; Social Media Disabled for Under 13 → **No** (only
  meaningful when Social Media is Yes); Messaging and Chat → **No** (WhatsApp
  opens outside the app and reaches staff, not other users); Advertising →
  **No** (the app promotes AS's own products and events; no ad SDK, nobody
  pays for placement — revisit if a promoter ever does).
  Answering Yes to UGC or Social Media also obliges Guideline 1.2's report /
  block / filter tools, which the app does not have — a second rejection.
- **In-App Controls → Parental Controls: None, Age Assurance: None.** The app
  has neither — no parental PIN, no content filter, no age check. Build 4
  (1.1.1) was rejected on 2026-09-24 under **Guideline 2.3.6** because these
  were left ticked; Apple looks for the feature and rejects when it isn't there.

Make sure the spin's rules stay visible in the app — Apple expects a contest's
terms to be readable where it is offered.

> **Resolved 2026-09-25: the calculated rating is now 13+.** It had read 17+
> because Unrestricted Web Access, User-Generated Content and Social Media were
> all answered Yes. Override: **Not Applicable**; Age Suitability URL: blank;
> Korea's GRAC number: blank (games only). The Afghanistan exclusion follows
> from the Entertainment secondary category and is harmless for a Lebanese shop.

---

## 6. Pricing and Availability

- Price: **Free**.
- Availability: all territories is fine; delivery being Lebanon-only is a
  business fact, not an availability restriction. At minimum select Lebanon.
- No in-app purchases. Physical goods must **not** use IAP (Guideline 3.1.5(a)),
  so cash on delivery and Whish are correct and are not a violation.

---

## 7. App Review Information

| Field | What to put |
|---|---|
| Sign-in required | **Yes** |
| User name | `REVIEW_EMAIL` — e.g. `appreview@as.com.lb` |
| Password | `REVIEW_CODE` — the fixed **6-digit** code |
| Contact | a real name, a reachable phone (+961…) and an inbox someone watches — Apple calls this one |
| Attachment | optional; a short screen recording of sign-in → order → account deletion saves a round trip |

**Set the two variables in the store API's `.env` before submitting**, then
`npm run deploy:store`:

```bash
REVIEW_EMAIL=appreview@as.com.lb
REVIEW_CODE=481903
```

**The code must be exactly six digits.** The app's code field strips anything
else and caps at six, on a number-pad keyboard, so a longer or alphanumeric code
is one the reviewer physically cannot type — the server refuses to enable the
account rather than let that surface as a rejection.

Six digits is only a million guesses and this path skips the per-code attempt
cap, so it carries its own: ten wrong codes from one IP and that caller waits
fifteen minutes. The reviewer is never locked out by someone else's guessing, and
the *request* rate limit is skipped entirely so their own retries cost nothing.

Nothing else changes: every other account, every attempt cap, every rate limit is
untouched, and with either variable unset the whole path does not exist. The
server logs a line at boot whenever it is live — **unset both once the app is
approved.** They can also use Sign in with Apple with their own Apple ID, which
works without any of this.

The flow is in [otp.js](../as_store/server/src/otp.js) (`reviewAccountEnabled`,
`isReviewIdentifier`, `reviewCodeMatches`) and the two OTP routes in `app.js`;
`test/review-account.test.js` holds its edges.

Notes field, suggested:

```
AS Company is the app of Absolute Solutions SAL, an electronics retailer and event organiser in Lebanon.

SIGNING IN: the app signs in with a one-time code sent by email or WhatsApp. For review, use the demo account above: enter that email address, then type the fixed code from the Password field when the app asks for the code — nothing is sent anywhere and the code does not expire. You can also use Sign in with Apple with your own Apple ID. Browsing the store, the catalogue, events and the company pages needs no account at all.

ORDERS: we sell physical electronics delivered in Lebanon. Payment is cash on delivery, or online through Whish Pay (a Lebanese payment provider) on their own hosted page. Nothing digital is sold in the app, so no in-app purchase is involved. Please do not complete a real order — place one and we will cancel it, or stop at the checkout screen.

AS WALLET is store credit earned on delivered orders and spent on later ones. It cannot be bought.

DAILY SPIN is a free once-a-day prize wheel. It costs nothing to enter, requires no purchase, and pays out discount vouchers and gifts. Its terms are shown on the screen.

EVENTS: tapping an event opens WhatsApp with a pre-written reservation message to our staff. No ticket is sold in the app.

ACCOUNT DELETION: Account tab → Delete account. It deletes everything personal and is refused only while an order is still in flight.
```

---

## 8. Export compliance

Already handled in code: `ios.config.usesNonExemptEncryption: false` in
`app.json` writes `ITSAppUsesNonExemptEncryption` into the build, so App Store
Connect stops asking. The app only uses HTTPS, which is exempt — leave it as is
and upload no documentation.

---

## 9. Building and uploading

`eas.json` carries the iOS submit target (`submit.production.ios.ascAppId` =
`6813355139`). From `mobile/`:

```bash
npx --yes eas-cli@latest build --platform ios --profile production
npx --yes eas-cli@latest submit --platform ios --profile production
```

Always through `npx` — the global `eas-cli` is below the floor `eas.json` pins.

**Answer "no" when it offers to log in to your Apple account.** Every credential
already lives on the EAS server (see below) and an Apple login here cannot
succeed anyway — the 2FA code goes to a phone this account cannot read.

The build takes ~20 minutes, then App Store Connect needs another ~15 to process
it before it appears under **Build** on this page.

### The credentials, and why they were made by hand

`royaraygy@gmail.com` has two-factor authentication on a trusted phone number
that receives nothing, and no Apple device to show the code on. So `eas-cli`
can never log in to Apple, and every credential EAS would normally generate for
itself was created in the browser — where the session is already trusted — and
uploaded to EAS instead. **Nothing needs to be repeated for a normal rebuild**;
EAS reuses all of it.

| Credential | Value | Where it lives |
|---|---|---|
| Apple Team | `K85Z6HH5FB` — **Individual** account, "Roy Araygy" | — |
| APNs push key | `J2AYTZVG37` | EAS + `mobile/credentials/` |
| App Store Connect API key | `6CDFXV8MTN`, issuer `9020fa3e-2f6a-40e3-a95c-ccd4d0329ea6` | EAS ("EAS Submit") + `mobile/credentials/` |
| Distribution certificate | serial `5500AC871D39C8E7877EE92C5537461E`, **expires 2027-09-21** | EAS + `mobile/credentials/distribution.p12` |
| Provisioning profile | `5d8c769e-8b02-4f95-b31f-3209b97bd8a2`, **expires 2027-09-21** | EAS + `mobile/credentials/` |

`mobile/credentials/` is git-ignored and excluded from build uploads. The `.p12`
password is not written down here — keep it in a password manager.

**To recreate the certificate** (it expires, or the key is lost) — no Mac and no
Apple login needed, just the browser session and OpenSSL, which ships with Git
Bash:

```bash
cd mobile/credentials
MSYS_NO_PATHCONV=1 openssl req -new -newkey rsa:2048 -nodes   -keyout ios_distribution.key -out ios_distribution.csr   -subj "/emailAddress=royaraygy@gmail.com/CN=AS Company/C=LB"
```

Upload the `.csr` at developer.apple.com → Certificates → **+** → **Apple
Distribution**, download the `.cer`, then:

```bash
openssl x509 -in distribution.cer -inform DER -out distribution.pem -outform PEM
openssl pkcs12 -export -legacy -inkey ios_distribution.key -in distribution.pem   -out distribution.p12 -passout pass:<choose-one>
```

Then a new provisioning profile (Profiles → + → App Store Connect → the App ID →
that certificate), and upload both at expo.dev → the project → Credentials →
`lb.com.as.store` → Build credentials → App Store.

> **Keep `ios_distribution.key`.** Apple keeps no copy of your half of the pair;
> without it the certificate it hands back is unusable.

> The App ID `lb.com.as.store` must have **Sign in with Apple** and **Push
> Notifications** ticked *before* a profile is generated — a profile only carries
> entitlements the App ID had at that moment. Verify a downloaded profile with
> `openssl smime -inform DER -verify -noverify -in <file>.mobileprovision` and
> look for `com.apple.developer.applesignin` and `aps-environment: production`.

---

## 10. Sections with nothing to fill in

Skip these entirely for this app — they exist for in-app purchases, games and
apps that are already live:

| Section | Why it's empty |
|---|---|
| App Store Server Notifications (Production + Sandbox URL) | Apple POSTs subscription lifecycle events there. No IAP, no subscriptions, nothing to receive. |
| App-Specific Shared Secret | Key for validating IAP receipts. Don't generate one — an unused credential is only a leak risk. |
| In-App Purchases · Subscriptions | We sell physical goods; Guideline 3.1.5(a) forbids IAP for them. Cash on delivery and Whish are correct. |
| Game Center | Not a game. |
| In-App Events · Custom Product Pages · Product Page Optimization | Marketing tools for live apps. |
| Promo Codes | Needs a published app. |
| Nominations | For pitching Apple's editorial team, after launch. |
| **Remove App** | Deletes the record and Apple ID `6813355139` with it. Never. |

---

## 11. Sign in with Apple — what shipped, and the one portal step

Implemented on 2026-09-18 (Guideline 4.8, blocker 1). Full reasoning in
[mobile/README.md](README.md) → "Sign in with Apple".

| Piece | Where |
|---|---|
| Token verification, code exchange, revocation | `as_store/server/src/apple.js` |
| `POST /api/account/apple`, `apple` in auth methods and sign-up methods, revoke on delete | `as_store/server/src/app.js` |
| `customers.apple_sub` + `apple_refresh_token` | `as_store/db/schema.sql` |
| Native button + availability hook | `mobile/src/components/auth.jsx`, `mobile/src/lib/appleAuth.js` |
| Entitlement (`ios.usesAppleSignIn`) + plugin | `mobile/app.json` |
| Attack cases (forged, wrong app, expired, replayed) | `as_store/server/test/apple.test.js` — 10 tests |

Two deploys, in this order: **`npm run deploy:store`** (the route and the column
— the app's button 404s until it is up), then the iOS build.

**Optional portal step — revocation.** Apple asks an app that deletes accounts to
also withdraw the Sign in with Apple grant. That needs a key:

1. Certificates, Identifiers & Profiles → **Keys** → **+**, tick *Sign in with
   Apple*, configure it against `lb.com.as.store`, download the `.p8` (once
   only — Apple never shows it again).
2. Put `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` in the store
   API's `.env` (the `.p8` contents on one line, newlines as `\n`).

Without it everything still works — sign-in, deletion, the lot — and only the
message to Apple is skipped. With it, deletion reaches Apple's side too.

---

## 12. Order of operations

1. **Deploy the store API** — `npm run deploy:store` — so `/api/account/apple`
   and `customers.apple_sub` exist before any build reaches a phone.
2. **Add the review account** (blocker 2) and deploy it with the same push, if
   it is ready; otherwise deploy it separately — it is server-side, so it needs
   no new build.
3. **Upload the APNs key** to EAS (blocker 3).
4. **Build and submit**: `eas build --platform ios --profile production`, then
   `eas submit`. ~20 minutes to build, ~15 more for App Store Connect to process.
5. **Install the TestFlight build on a real iPhone.** Walk Sign in with Apple,
   an order, and Account → Delete account on a *release* build — R8-style
   surprises aside, this is the first time the native Apple sheet runs at all.
6. **Screenshots** from that device: iPhone 6.5" and iPad 13" (blocker 4).
7. **Fill the console**: App Information, version metadata, screenshots, App
   Privacy, age rating, pricing, App Review Information.
8. Select the build, then **Add for Review**.
