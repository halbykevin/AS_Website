// Everything about the reel that someone in marketing might want to change
// without reading a scene: how long each beat runs, what the closing card
// promises, and which app stores it may point at.

import { canvas } from './brand';

// ---------------------------------------------------------------------------
// Where the app can actually be downloaded.
//
// These default to `false` on purpose. As of this writing the Android build is
// a draft on the internal track and iOS has no APNs key uploaded, so neither
// listing is public — and an advert that says "Download on the App Store" over
// a link that 404s is the one thing a launch reel must not do. Flip each one
// the day its listing goes live and the closing card changes wording by itself.
// ---------------------------------------------------------------------------
export const stores = {
  android: false,
  ios: false
};

export const cta = {
  // Shown when neither store is live.
  soon: 'Coming soon to Android & iOS',
  // Shown once at least one is. The closing card picks between them.
  live: 'Download the AS Company app',
  site: 'as.com.lb',
  store: 'store.as.com.lb'
};

// The claims on screen. Kept here so they are checkable in one place rather
// than buried in eight scenes.
//
// `catalogue` is rounded *down* from the measured count in
// `src/data/products.json` — "1,200+" stays true as the catalogue moves, where
// an exact figure goes stale the night of the next sync.
export const claims = {
  // Spend $1,000, get $50 back — `wallet_settings.earn_percent` defaults to 5.
  walletEarnPercent: 5,
  walletExampleSpend: 1000,
  // `spin_settings.cooldown_hours` on the live store.
  spinCooldownHours: 24
};

// ---------------------------------------------------------------------------
// The cut. Durations are in frames at 30fps; `SCENES` is also the running
// order, so reordering the array reorders the reel.
//
// ~26s once the overlaps below are taken out. Reels allow 90, but retention
// falls off a cliff after about 30 — every beat here has to earn its seconds,
// and the two that sell hardest (the catalogue and the wheel) get the most.
// ---------------------------------------------------------------------------
export const SCENES = [
  { id: 'hook', duration: 84 }, //     2.8s — stop the scroll
  { id: 'shop', duration: 138 }, //    4.6s — the catalogue is the product
  { id: 'bag', duration: 96 }, //      3.2s — how easy buying is
  { id: 'wallet', duration: 108 }, //  3.6s — the money reason to install
  { id: 'spin', duration: 114 }, //    3.8s — the fun reason to come back
  { id: 'events', duration: 102 }, //  3.4s — the half nobody expects
  { id: 'assistant', duration: 96 }, // 3.2s
  { id: 'cta', duration: 102 } //      3.4s — the ask
];

// How many frames two neighbouring beats overlap.
//
// Sequences in a `<Series>` are laid end to end, so a scene that fades its own
// contents out is followed by one whose contents have not faded in yet — which
// is a frame of bare background at every cut. Pulling each scene back over its
// predecessor makes the two visible at once, and the fades become a real
// cross-dissolve instead of a dip through the backdrop.
export const CROSSFADE = 7;

export const DURATION =
  SCENES.reduce((total, scene) => total + scene.duration, 0) - CROSSFADE * (SCENES.length - 1);

// Frame each scene starts on, so a scene can be previewed in isolation and the
// cover still can be pinned to a beat rather than a magic number.
export const startOf = id => {
  let at = 0;
  for (const scene of SCENES) {
    if (scene.id === id) return at;
    at += scene.duration - CROSSFADE;
  }
  return 0;
};

export const seconds = frames => frames / canvas.fps;
