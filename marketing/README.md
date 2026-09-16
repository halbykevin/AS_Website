# AS marketing video

Remotion studio for AS Company's social video. Today it holds one deliverable —
**`AppReel`**, a 26-second vertical reel for the mobile app — but it is set up as
a studio rather than a one-off, so a store reel or a ticketing reel is a new
scene folder and a new `<Composition>`, not a new project.

```bash
cd marketing
npm install
npm run studio     # the editor: scrub, tune, preview every beat live
npm run render     # -> out/as-app-reel.mp4   (1080x1920, H.264)
npm run cover      # -> out/as-app-reel-cover.png  (the reel's cover frame)
npm run content    # re-pull products / events / the wheel from the live APIs
```

Output is **1080x1920 at 30fps**, which is what Instagram wants for a Reel and
what TikTok and YouTube Shorts accept unchanged. `out/` is git-ignored.

---

## The one thing to check before posting

**`stores` in [src/config.js](src/config.js) is `{ android: false, ios: false }`,
and the closing card therefore says *"Coming soon to Android & iOS"*.**

That is deliberate and it is currently true: the Play listing is a draft on the
internal track and iOS has no APNs key uploaded, so neither store page is public.
Flip a flag the day its listing goes live and the card rewords itself and grows
the matching button — nothing else to edit.

The buttons are plain pills with the stores' names set in type, **not** the
official "Get it on Google Play" / "Download on the App Store" badges. Those are
trademarked artwork with rules about size, spacing and wording that an
approximation drawn in code would breach. Drop the real assets into `public/` and
swap `StorePill` when you need them.

---

## Everything on screen is real

There is no stock imagery and no lorem in this reel. `npm run content` pulls
three snapshots from the live APIs into [src/data/](src/data/), and the scenes
render those:

| File | From | Used by |
| --- | --- | --- |
| `products.json` + `public/products/*.webp` | AS Store API | the shop grid, the product page, the assistant's answers |
| `events.json` | AS Website API | the events list and the WhatsApp message |
| `spin.json` | AS Store API | every slice of the prize wheel |

The snapshots are **committed on purpose**. A render has to produce the same
frames twice, and a video that shipped last week should still rebuild next month
— neither is true if the scenes fetch at render time. Re-run `npm run content`
when the reel starts looking dated, and **read the diff before committing**: a
price, a date and the odds-bearing labels on the wheel are all promises the
business then has to keep.

A few claims are checked rather than typed:

- **"1,200+ products"** is `products.json`'s measured total rounded *down* to the
  nearest hundred, so it stays true as the nightly catalog sync adds and delists
  rows. The honest failure is understating the shop.
- **"$50 back on $1,000"** is `wallet_settings.earn_percent` (5%) applied to a
  round example, and the same rate prints the "$13.10 back" on the product page —
  both read `claims` in config.js, so they cannot drift apart.
- **`+ VAT`** appears wherever a price does, because VAT is 11% and added at
  checkout. An advert quoting the bare number would quote a price nobody pays.
- **The wheel** is the live wheel: 14 slices, their real labels, their real
  colours, drawn with the geometry module the app and the CMS preview share.

**Event poster artwork is deliberately not used.** It belongs to the promoters,
and an advert is a different use from a listing page, so the event cards are
drawn from the facts instead — which reads better at this size anyway.

---

## The cut

Eight beats, ~26 seconds. Durations live in `SCENES` in
[src/config.js](src/config.js); that array is also the running order, so
reordering it reorders the video.

| # | Beat | ~ | What it argues |
| --- | --- | --- | --- |
| 1 | Hook | 2.8s | Three words that are also the reel's structure |
| 2 | Shop | 4.6s | The catalogue is the product |
| 3 | Bag | 3.2s | Buying is one tap |
| 4 | Wallet | 3.6s | The money reason to install |
| 5 | Spin | 3.8s | The reason to come back tomorrow |
| 6 | Events | 3.4s | The half nobody expects |
| 7 | Assistant | 3.2s | The shop answers questions |
| 8 | CTA | 3.4s | The ask |

Reels allow 90 seconds, but retention falls off a cliff after about 30, so the
two beats that sell hardest get the most time. Each beat is also its own
composition in the studio (`Scene-Shop`, `Scene-Spin`, …) — tuning the wheel's
deceleration by scrubbing 19 seconds into the full reel every time is how you
stop tuning it.

---

## Two rules the design follows

**Captions are top-anchored and large.** Reels are watched muted, so the caption
is not a subtitle — it is the argument, and the picture illustrates it. Instagram
draws its own caption, audio strip and profile row over the bottom of the frame
and an action rail down the right, so `safe` in [src/brand.js](src/brand.js)
keeps anything that has to be read out of those margins. Nothing readable is
below 34px.

**Scenes cut, the background doesn't.** One `<Background>` runs the whole length
and every scene fades its own contents in and out at its edges (`useSceneFade`),
while each scene is pulled back over its predecessor by `CROSSFADE` frames. Laid
end to end instead, a scene that has faded out is followed by one that has not
faded in — a frame of bare background at every cut. The overlap is what makes
the two ramps one dissolve, and it is why there is no transitions dependency.

---

## Files

```
src/
  index.jsx        registerRoot
  Root.jsx         the compositions: AppReel + one per scene
  AppReel.jsx      the running order
  brand.js         palette, canvas, Instagram safe areas, phone geometry, type scale
  config.js        the cut, the claims, and the app-store switches
  scenes/          one file per beat
  components/      Phone, AppHeader, AppTabBar, ProductTile, Caption, Icon, Background
  lib/
    anim.js        springs, fades, count-ups — the reel's motion vocabulary
    wheel.js       a deliberate copy of the app's wheel geometry
    catalogue.js   the snapshot, and the questions scenes ask of it
    fonts.js       Inter, the brand font
  data/            the committed snapshots
public/
  brand/           app icon + logos, copied from mobile/assets
  products/        real product photos
scripts/
  fetch-content.mjs
```

Two things are copied rather than imported, and both are copied on purpose
(nothing here shares a package with the app):

- **`lib/wheel.js`** is the app's wheel geometry, which is itself a copy of the
  store CMS's. The reel joins that rule for the same reason the other two exist:
  the wheel in an advert has to be the wheel in the app, down to which slice sits
  under the pointer at rest. Change one, change all three.
- **The app's chrome** — the tab bar, the product tile, the header — is rebuilt
  from `mobile/src/components/`. If the app's navigation changes, this reel is
  advertising a screen that no longer exists, so re-check it before a re-cut.

Icons are originals, not Ionicons traced by eye, and the WhatsApp glyph is a
plain chat bubble rather than an approximation of their mark — the scene says
"WhatsApp" in words, which is what the app honestly does.
