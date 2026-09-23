# Guideline 2.1 — Information Needed (rejection of 2026-09-22)

Apple asked for six things after build 4 (v1.1.1). This file holds all of them:
what to record, what to paste into the **Resolution Center reply**, and what to
paste into **App Review Information → Notes** (they asked for both — the reply
answers this submission, the Notes field stops them asking again next time).

Nothing here is invented. Every claim is checked against the code; the few
things only you can attest to are flagged in §5 and must be settled before you
send.

> **The two paste blocks use no dashes as punctuation**, on purpose. Keep it that
> way if you edit them.

> **This is not a functional rejection.** 2.1 "limited App Review history" is the
> questionnaire Apple sends a developer account that has not shipped before. They
> did not report a bug, a crash or a failed sign-in. Answer it completely and the
> next pass is a normal review.

---

## 0. Before you reply — four checks

1. **The demo account must actually work.** The reply quotes it. On the VPS:
   ```bash
   pm2 logs as-store-api --nostream | grep -i review   # warns at boot while live
   ```
   `REVIEW_EMAIL` / `REVIEW_CODE` live in `/opt/as-company/as_store/server/.env`.
   Then prove it on the phone you record with: sign in as that address, with that
   code, on the TestFlight build. If it fails, fix it *before* replying —
   quoting a broken credential turns a 2.1 questionnaire into a 2.1 rejection.
2. **App Review Information contact fields** (name, phone, email) must be filled
   in. Apple phones this number.
3. **The recording is the whole point of the reply** (§2). Without it the reply
   does not count as answered.
4. **Read §5** — two things in the app need a decision before you make claims
   about them in writing.

---

## 1. What they asked, and where it is answered

| # | Apple asked for | Answered in |
|---|---|---|
| 1 | Screen recording on a physical device: registration, login, deletion; UGC + reporting/blocking; paid content | §2 (record it), §3 item 1 |
| 2 | Purpose and target audience | §3 item 2 |
| 3 | Setup and access instructions, credentials, sample files | §3 item 3 |
| 4 | External services, tools, platforms | §3 item 4 |
| 5 | Regional differences | §3 item 5 |
| 6 | Regulated industry / protected third-party material | §3 item 6 |

---

## 2. The screen recording

**Rules Apple is checking:** a *physical* iPhone (not a simulator — you are on
Windows, so this is TestFlight on a real device anyway), the *latest* iOS, it
**begins with launching the app**, and it shows registration, login and
**account deletion**. Deletion is mandatory in any app that lets you create an
account; leaving it out is the single most common cause of a second 2.1.

Record with the phone's own screen recorder (Control Centre), portrait, one
continuous take if you can. Roughly 5–8 minutes. Narration is optional but
helps; if you narrate, say what you are about to do before you do it.

### Shot list — in this order

| # | Show | Notes |
|---|---|---|
| 1 | The iPhone home screen, then **tap the AS Company icon** | Apple asked for the launch; do not start mid-app |
| 2 | Home tab: store rows, search box | Browsing works **signed out** — say so |
| 3 | Shop tab → filter/sort toolbar → open a product | Show a price and "get $N back" |
| 4 | Add to bag → Bag tab | Shows the flight animation and the badge |
| 5 | Checkout screen: address, cash on delivery, Whish Pay | **Stop here.** Do not place a real order |
| 6 | Events tab → an event → **Reserve on WhatsApp** | Show the pre-filled message. No ticket is sold in-app |
| 7 | Assistant: ask "a laptop for university" | Shows the bot answering with real products |
| 8 | Daily Spin: the wheel and its terms | Free entry, no purchase |
| 9 | Account tab → **Sign in** | Show all three: Apple, Google, one-time code |
| 10 | **Login** with the demo account: email → Send code → type the 6-digit code | The flow Apple must see working |
| 11 | Account: orders, AS Wallet, addresses, notifications | |
| 12 | Sign out → **Create account** → name + email + code | This is the **registration** flow |
| 13 | On that new account: Account → **Delete account** → read the screen → type `DELETE` → **Delete my account** | The confirmation word is literally `DELETE` |
| 14 | The app returns signed out; try signing in with that address again to show it is gone | Closes the loop convincingly |

Register and delete **the same throwaway account** (steps 12–13) so deletion is
demonstrated without destroying the demo account Apple still needs.

**Do not show:** a real customer's data, the admin dashboard, or a completed
order with someone's address on screen.

**Attaching it:** App Store Connect → Resolution Center → Reply → paperclip.
If the file is too large, compress it (720p is fine) or upload it unlisted to
YouTube/Vimeo and put the link in the reply as well as attaching the smaller
file. Also attach or link it in App Review Information for next time.

---

## 3. The reply — paste this into Resolution Center

> Fill every `[...]` first, and settle §5 before you send.

```text
Hello,

Thank you for reviewing AS Company. Everything requested is below, in the order you asked for it. The same information, condensed, is now in App Store Connect under App Review Information > Notes for future submissions.

1. SCREEN RECORDING

Attached: a screen recording captured on an iPhone [MODEL] running iOS [VERSION], using build [NUMBER] (version 1.1.1) installed from TestFlight. It begins with launching the app from the home screen and follows a typical user flow: browsing the store with no account, a product page, adding to the bag, the checkout screen, the events section and its WhatsApp reservation, the shopping assistant, the daily prize spin, signing in with the demo account, creating a new account from scratch, and deleting that account from inside the app.

On the three flows you listed specifically:

Account registration, login and account deletion. All three are in the recording. Registration is Account tab > Create account (name, email, then a 6-digit code emailed to that address). Login is Account tab > Sign in, which offers Sign in with Apple, Google, or a one-time code by email or WhatsApp. Account deletion is Account tab > Delete account: the screen lists exactly what is removed, the customer types the word DELETE to confirm, and the account and all personal data are deleted immediately. We keep only the bookkeeping record of orders already placed, with the name, address and contact details stripped out, because Lebanese law requires the record and a warranty claim still has to find the order. This is stated on the deletion screen itself and in our privacy policy.

User-generated content. The app has none. There is no chat between users, no profiles, no reviews, no comments, no uploads, and nothing a customer writes is ever shown to another customer. There is therefore no content to report or block. The only free text a customer can enter goes to our own staff (an order note) or to our shopping assistant, which is a bot answering from our product catalogue, not another user.

Paid content or features. There are none. The app has no in-app purchases, no subscriptions, no paid tiers and no digital content. Everything in the catalogue is a physical electronic product that we deliver ourselves in Lebanon, paid for by cash on delivery or online through Whish Pay. The recording shows the checkout screen and stops before an order is placed, so that you are not sent goods. If you would prefer to see an order completed end to end, please place one and tell us here: we will cancel it immediately, nothing is dispatched and nothing is charged.

2. PURPOSE AND TARGET AUDIENCE

AS Company is the official app of Absolute Solutions SAL, an electronics and telecommunications company that has been trading in Lebanon since 2008. The app puts our business in the customer's hands: our retail catalogue, our delivery service, our store credit scheme, and the events we help promote.

Target audience: consumers in Lebanon, aged 13 and over, buying consumer electronics such as phones, laptops, audio, gaming and accessories, together with people looking for concerts, comedy and theatre happening in Lebanon. It is a general-audience retail app, not a professional or enterprise tool.

The problem it solves: in Lebanon, buying electronics usually means travelling to a shop in person or negotiating item by item over WhatsApp, with no reliable way to see what is actually in stock or what it costs. Our customers asked for one place to see the real catalogue with current prices, order for cash on delivery anywhere in the country, and follow the order to the door. The app also answers the second question those customers ask us constantly, which is what is on this month, by listing events in Lebanon with dates and venues.

The value it provides: more than 1,200 products with live prices and stock; delivery across Lebanon with cash on delivery or online payment; AS Wallet, which credits a percentage of every delivered order back as store credit that comes off a later order; order tracking and notifications; a shopping assistant that finds products from a plain-language description; and a free daily prize spin. Everything except placing an order can be used without an account.

3. SETTING UP AND ACCESSING THE MAIN FEATURES

No setup, no configuration and no sample files are required. The app talks to our own live production servers on first launch. Browsing the entire catalogue, searching, the events section, the company pages and the shopping assistant all work with no account at all. An account is needed only to place an order, use AS Wallet or use the daily spin.

Demo account (also entered in the App Review Information fields):
User name: [REVIEW_EMAIL]
Password: [REVIEW_CODE]

To sign in with it: open the app, go to the Account tab, tap Sign in, choose "Continue with email", enter the address above, tap "Send code", and then type the 6-digit code above when the app asks for the code. This is a review-only account: no email is actually sent, the code is fixed, and it never expires. You may equally use Sign in with Apple with your own Apple ID, which creates an ordinary account.

The main features, and where to find them:

Shop (tab 2): the full catalogue, with sort and filter by category, brand, price and availability. Tap any product for details, then "Add to Bag".

Bag (tab 4) and checkout: choose a delivery address, then cash on delivery or Whish Pay. Please do not complete a real order (see item 1 above).

AS Wallet: Account tab > AS Wallet. Store credit earned on delivered orders. It cannot be bought, topped up or withdrawn; it is only ever earned from a purchase and spent on a later one.

Daily Spin: the wheel reached from the home screen and the account tab. Free, once per day, no purchase and no payment of any kind. Prizes are discount vouchers, free delivery or a gift, and the rules are shown on the screen.

Events (tab 3): events happening in Lebanon, with date, venue and details. Tapping "Reserve" opens WhatsApp with a pre-written message to our staff, who confirm the reservation by hand. No ticket is ever sold or issued in the app.

Shopping assistant: the chat button on the home screen. Describe what you need in plain words and it returns real products from our catalogue.

Guess the Score: a free prediction game with a prize draw. No entry fee and no purchase.

Account deletion: Account tab > Delete account.

4. EXTERNAL SERVICES, TOOLS AND PLATFORMS

Our own infrastructure: the app has no database of its own. It reads two REST APIs we build and operate (Node.js and PostgreSQL) on our own server, plus our own websites for the legal pages it links to.

Third-party services used to deliver core functionality:

Whish Pay (Lebanon): online card payment. The customer is handed to Whish's own hosted payment page; card details are entered there and we never see or store them. We receive only whether the payment succeeded.

Sign in with Apple: authentication. We verify the identity token's signature on our server and recognise the customer by the Apple subject identifier, not by email address. Deleting an account also revokes the grant.

Google Sign-In (Google OAuth 2.0): authentication, as an alternative to Apple.

WhatsApp Business Cloud API (Meta): delivers the 6-digit sign-in code to customers who choose WhatsApp instead of email, and the wa.me links used for event reservations and price enquiries.

Our own SMTP mail server: delivers the 6-digit sign-in code by email, and order confirmations.

Google Gemini API (Google): powers the shopping assistant. The customer's question and our own product data are sent to the model from our server; the API key never leaves our server. The model can only look up products in our catalogue, and every product shown in an answer is rendered from our own database with a live price, not from the model's text.

Expo Application Services (EAS, by Expo): builds the app, delivers over-the-air JavaScript updates, and relays push notifications to Apple's APNs.

Apple Push Notification service: order status and promotional notifications, with the customer's permission.

Event listings: collected from publicly published event calendars in Lebanon (ticketingboxoffice.com, tickit.co, ihjoz.com) and shown as listings with date and venue. The app sells no tickets.

The app contains no advertising SDK, no analytics SDK, no cross-app tracking and no advertising identifier, which is why it presents no App Tracking Transparency prompt. Our App Privacy declaration and our privacy policy at https://store.as.com.lb/pages/privacy describe the same data collection.

5. REGIONAL DIFFERENCES

The app functions identically in every region. There is no geo-gating, no region-specific content, no feature that appears or disappears based on the device's country, and no A/B or staged rollout. It ships in English only and prices are shown in US dollars everywhere, which is the currency Lebanese retail is quoted in.

The one real-world limitation is commercial rather than technical: we deliver physical goods within Lebanon only, and the events we list are events taking place in Lebanon. Someone outside Lebanon can install the app, browse the whole catalogue, create an account and use every feature, but we cannot deliver an order to them. Nothing is hidden from them and nothing behaves differently.

6. REGULATED INDUSTRY AND THIRD-PARTY MATERIAL

We do not operate in a regulated industry. Absolute Solutions SAL is a retailer of consumer electronics and a promoter of events. The app provides no financial, medical, legal, gambling or similarly regulated service.

On the points that can look regulated from the outside:

Payments: we are not a payment provider and we handle no card data. Online payments are processed entirely by Whish Pay on their own hosted page under their own licences; we receive only a success or failure result. The alternative is cash paid to our driver on delivery.

AS Wallet is not a financial product. It is store credit, expressed in dollars for clarity. It can only be earned as a percentage of a delivered order and can only be spent against a later order in our own store. It cannot be bought, topped up, transferred, withdrawn or converted to money.

The Daily Spin and Guess the Score are not gambling. Entry is free and cannot be purchased with money or with store credit; there is no stake, nothing is wagered and nothing can be lost. Prizes are discount vouchers, free delivery or a gift. Both are declared as contests in our age rating questionnaire, and their terms are shown in the app where they are offered.

Third-party material: the products we sell are physical goods we buy and resell as an authorised reseller, and the product photography and brand names shown are those of the manufacturers and distributors whose products we stock. The events section lists publicly announced public events with their date and venue, and links the customer to our own staff over WhatsApp; we sell no tickets and issue none. We are happy to provide our commercial registration and supplier documentation on request. Please tell us which documents you would like to see.

Please let us know if anything above is unclear or if you would like a further recording of a specific flow. We will respond the same day.

Kind regards,
[YOUR NAME]
[YOUR TITLE], Absolute Solutions SAL
[PHONE] | [EMAIL]
```

---

## 4. App Review Information → Notes

Apple asked for this to be in the Notes field too. It has a 4,000-character
limit, so this is the same information at a third of the length (3,418
characters as written, or 3,442 if newlines count double, leaving room to edit). It replaces the draft note in
[APPSTORE.md](APPSTORE.md) §7 — keep the two in step.

```text
AS Company is the app of Absolute Solutions SAL, an electronics retailer and event promoter trading in Lebanon since 2008. It is a general-audience retail shopping app: our catalogue, our delivery service, our store credit scheme, and a listing of events in Lebanon. Audience: consumers in Lebanon aged 13+.

NO ACCOUNT NEEDED to browse the catalogue, search, read events or use the shopping assistant. An account is needed only to order, to use AS Wallet or to spin the daily wheel.

SIGNING IN: Account tab > Sign in. Methods: Sign in with Apple, Google, or a one-time 6-digit code by email or WhatsApp. For review, use the demo account above: choose "Continue with email", enter that address, tap "Send code", then type the fixed code from the Password field. Nothing is sent anywhere for that address and the code never expires. Sign in with Apple with your own Apple ID also works.

REGISTRATION: Account tab > Sign in > Create account (name, email, 6-digit code).

ACCOUNT DELETION: Account tab > Delete account. Type DELETE to confirm. Everything personal is deleted at once; only the bookkeeping record of past orders is kept, with name, address and contact details stripped, as Lebanese law requires and our privacy policy states. It is refused only while an order is still in flight, with an explanation.

NO PAID CONTENT, NO IN-APP PURCHASES, NO SUBSCRIPTIONS. Everything we sell is a physical electronic product we deliver in Lebanon, paid cash on delivery or online via Whish Pay on Whish's own hosted page (we never see card details). Please do not complete a real order: stop at the checkout screen, or place one and tell us and we will cancel it at no charge.

NO USER-GENERATED CONTENT. No chat between users, no profiles, reviews, comments or uploads; nothing a customer writes is shown to another customer, so there is no reporting or blocking mechanism. The shopping assistant is a bot answering from our own catalogue.

AS WALLET is store credit earned as a percentage of delivered orders and spent on later ones. It cannot be bought, topped up, transferred or withdrawn.

DAILY SPIN and GUESS THE SCORE are free contests: no entry fee, no purchase, no stake. Prizes are discount vouchers, free delivery or gifts. Terms are shown on screen.

EVENTS: publicly announced events in Lebanon, with date and venue. "Reserve" opens WhatsApp with a pre-written message to our staff, who confirm by hand. No ticket is sold or issued in the app.

EXTERNAL SERVICES: our own Node/PostgreSQL APIs; Whish Pay (payments, hosted page); Sign in with Apple and Google Sign-In; WhatsApp Business Cloud API and our own SMTP server (one-time codes, order mail); Google Gemini API (the shopping assistant, server-side key, answers grounded in our catalogue); Expo Application Services (builds, OTA updates, push relay); Apple Push Notification service. No advertising SDK, no analytics SDK, no cross-app tracking, no advertising identifier, so no ATT prompt.

REGIONS: identical everywhere. No geo-gating, no region-specific content or features. English only, prices in USD. We deliver within Lebanon only and list Lebanese events, a commercial limit rather than a technical one; anyone anywhere can install, browse and create an account.

NOT A REGULATED INDUSTRY: consumer electronics retail and event promotion. No financial, medical, legal or gambling service. Privacy policy: https://store.as.com.lb/pages/privacy
```

---

## 5. Two things to settle before you send

### 5.1 The third-party material sentence in item 6

Apple's question 6 is a rights question, and item 6 of the reply says the
product photography and brand names are the manufacturers' and distributors',
shown by an authorised reseller. **That has to be true, and the paperwork has to
exist if they ask for it.** Two things in this repo make it worth a moment's
thought rather than a reflex yes:

- The catalogue arrives through the scraper
  ([sync-catalog.mjs](../as_store/scripts/sync-catalog.mjs)), photography
  included, from a source shop. Reselling the goods and republishing another
  shop's photographs of them are different permissions.
- Event artwork belongs to the promoters, and the seat maps in the events
  section are the ticketing partner's own drawings, served through our API
  ([seatmap/svg.js](../server/src/seatmap/svg.js)).

`APPSTORE.md` §1 already commits you to the App Store Connect content-rights
attestation ("Yes, it contains third-party content, and I have the necessary
rights"), so this is the same claim, in prose, to a reviewer who may ask for
evidence. If you would rather not invite the question, cut the sentence back to:
*"The products we sell are physical goods we buy and resell; we are happy to
provide our commercial registration on request."* Do not claim documents you
cannot produce.

### 5.2 The one digital product in the database

The reply says the app sells nothing digital. That is true of everything a
reviewer can reach — but **RaiOne**, the $1 software licence
([exclusive.sql](../as_store/db/exclusive.sql)), is a real row with
`visible = false`. It is out of the grid, out of search and out of every
category, so it cannot be found by browsing; but `GET /api/products/:slug`
serves any product by slug regardless of visibility
([app.js:2796](../as_store/server/src/app.js#L2796)), so the app's
`/product/RaiOne` screen would render it for anyone who had the link.

Nobody will reach it during review. It matters because a software licence is
digital content, and digital content sold outside In-App Purchase is Guideline
3.1.1 — a rejection with real consequences, unlike this one. Cheapest fix, if
you want the sentence to be unconditionally true: have the app's product screen
refuse a product that is `exclusive` (or not `visible`), the way
[loadProduct()](../as_store/src/lib/catalog.js) 404s hidden products on the web.
That is a JavaScript-only change, so it ships as an OTA update without a new
build. Your call — nothing has been changed.

---

## 6. After this is approved

- Unset `REVIEW_EMAIL` and `REVIEW_CODE` on the VPS and redeploy the store API.
  The server logs a boot warning the whole time they are live.
- Keep this file and [APPSTORE.md](APPSTORE.md) in step with the app. App Review
  reads the Notes field against what the app does, and the next reviewer will
  have this one on file.
