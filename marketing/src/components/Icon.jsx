// The icon set, drawn here rather than imported.
//
// The app uses Ionicons, which is a font package — pulling it in to draw five
// tab glyphs would add a webfont to a video renderer for no gain, and tracing
// someone else's paths by eye gets them subtly wrong. These are originals in
// the same visual language: one 24x24 grid, 1.8px strokes, round caps, so they
// read at the ~26px they are actually drawn at inside the phone.
//
// `whatsapp` is deliberately a plain chat bubble and not the WhatsApp mark — an
// approximation of someone's logo is worse than not using it. The scene says
// "WhatsApp" in words instead, which is what the app honestly does.

import React from 'react';

const paths = {
  storefront: (
    <>
      <path d="M3.5 9.2 5 4.8h14l1.5 4.4v.6a2.1 2.1 0 0 1-4.2 0 2.1 2.1 0 0 1-4.2 0 2.1 2.1 0 0 1-4.2 0 2.1 2.1 0 0 1-4.2 0z" />
      <path d="M5.2 12v7.2h13.6V12" />
      <path d="M10 19.2v-4.4h4v4.4" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.8" />
      <rect x="13" y="4" width="7" height="7" rx="1.8" />
      <rect x="4" y="13" width="7" height="7" rx="1.8" />
      <rect x="13" y="13" width="7" height="7" rx="1.8" />
    </>
  ),
  bag: (
    <>
      <path d="M5.8 8h12.4l1 11.4a1.4 1.4 0 0 1-1.4 1.5H6.2a1.4 1.4 0 0 1-1.4-1.5z" />
      <path d="M9 8.6V6.4a3 3 0 0 1 6 0v2.2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.6" y="5.4" width="16.8" height="15" rx="2.6" />
      <path d="M3.6 10h16.8M8.2 3.4v3.6M15.8 3.4v3.6" />
      <circle cx="8.6" cy="14" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="10.6" cy="10.6" r="6.2" />
      <path d="M15.2 15.2 20 20" />
    </>
  ),
  chat: (
    <path d="M12 4.2c4.7 0 8.4 3.1 8.4 7s-3.7 7-8.4 7a10 10 0 0 1-2.6-.34L5 19.6l1.1-3.3A6.7 6.7 0 0 1 3.6 11.2c0-3.9 3.7-7 8.4-7z" />
  ),
  wallet: (
    <>
      <rect x="3.4" y="6" width="17.2" height="13" rx="3" />
      <path d="M3.4 10.2h17.2" />
      <circle cx="16.6" cy="14.6" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  sparkle: (
    <path d="M12 3.2 13.9 9 19.8 10.9 13.9 12.8 12 18.6 10.1 12.8 4.2 10.9 10.1 9z" />
  ),
  check: <path d="m5 12.6 4.6 4.6L19 6.8" />,
  pin: (
    <>
      <path d="M12 21s6.4-6.1 6.4-10.4a6.4 6.4 0 1 0-12.8 0C5.6 14.9 12 21 12 21z" />
      <circle cx="12" cy="10.4" r="2.4" />
    </>
  ),
  arrowRight: <path d="M4.8 12h14M13.2 6.2 19 12l-5.8 5.8" />,
  play: <path d="M7.6 4.8 19.2 12 7.6 19.2z" fill="currentColor" stroke="none" />
};

export default function Icon({ name, size = 24, color = 'currentColor', strokeWidth = 1.8, filled = false, style }) {
  const glyph = paths[name];
  if (!glyph) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {glyph}
    </svg>
  );
}
