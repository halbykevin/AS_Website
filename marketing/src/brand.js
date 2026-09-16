// The AS brand, as the video uses it.
//
// Ported from `mobile/src/theme/tokens.js` — the same palette the app itself is
// painted with, so a viewer who installs after watching meets the colours they
// were just shown. Add here rather than hard-coding a hex in a scene.

export const brand = {
  // AS brand red.
  red: '#A41E22',
  redDark: '#82161A',
  redLight: '#C53A3F',
  // Neutrals.
  gray: '#B6B7B8',
  charcoal: '#383F41',
  // Dark commerce surfaces — the app's store chrome, and this video's backdrop.
  ink: '#15181A',
  inkSoft: '#222A2D',
  inkLine: '#2C3236',
  // Accents / light surfaces.
  amber: '#F2A93B',
  bg: '#EAEDED',
  fog: '#F5F5F7',
  blush: '#FBE6E8',
  white: '#FFFFFF',
  // WhatsApp's own green, used only where the app really does hand over to
  // WhatsApp — the same `chatGreen` the app and the store's chat bubble use.
  whatsapp: '#25D366',
  whatsappDark: '#1DA851'
};

export const canvas = { width: 1080, height: 1920, fps: 30 };

// Instagram draws its own chrome over the video: the caption, the audio strip
// and the profile row along the bottom, the action rail down the right, the
// mute/more buttons at the top. Nothing that has to be read may sit inside
// these margins — which is why every caption in this reel is top-anchored,
// where Reels' own UI is thinnest.
export const safe = { top: 190, bottom: 380, side: 88, right: 210 };

// The phone the app is shown inside. Sized so the device chin stops above the
// caption overlay, and the screen still fills more than half the frame.
export const phone = {
  width: 560,
  height: 1160,
  x: (canvas.width - 560) / 2,
  y: 400,
  radius: 66,
  bezel: 13
};

export const screen = {
  width: phone.width - phone.bezel * 2,
  height: phone.height - phone.bezel * 2,
  radius: phone.radius - phone.bezel
};

// Type scale. Reels are watched small and muted, so the floor is high: nothing
// a viewer must read is below 34px, and headlines are deliberately huge.
export const type = {
  hero: 132,
  display: 96,
  headline: 68,
  title: 52,
  body: 40,
  small: 34,
  micro: 26
};

export const shadow = {
  device: '0 60px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
  card: '0 18px 40px rgba(0,0,0,0.18)',
  lift: '0 10px 30px rgba(0,0,0,0.30)'
};
