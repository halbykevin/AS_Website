// The device the app is shown inside.
//
// Drawn rather than photographed: a mockup PNG pins the reel to one handset and
// one year of industrial design, and anything rendered behind glass has to
// match its perspective. This is flat-on, generic, and the screen is a real
// clipping container — scenes just render UI into it.

import React from 'react';
import { brand, phone, screen, shadow } from '../brand';
import { interpolate } from '../lib/anim';

export const STATUS_BAR = 64;
export const HOME_BAR = 26;

/** Usable height for a scene's own chrome, once the status bar is taken out. */
export const CONTENT_HEIGHT = screen.height - STATUS_BAR;

function StatusBar({ tint = brand.ink }) {
  const bar = { background: tint, borderRadius: 3 };
  return (
    <div
      style={{
        height: STATUS_BAR,
        padding: '0 38px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: tint,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: -0.2,
        flexShrink: 0
      }}
    >
      <span style={{ paddingTop: 6 }}>9:41</span>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, paddingTop: 8 }}>
        {/* Signal bars, then wifi, then a battery — the three every phone shows. */}
        {[7, 10, 13, 16].map(h => (
          <div key={h} style={{ ...bar, width: 4, height: h }} />
        ))}
        <svg width="20" height="16" viewBox="0 0 20 16" fill="none" style={{ marginLeft: 4 }}>
          <path d="M1 5.4a13 13 0 0 1 18 0M4.4 9a8.2 8.2 0 0 1 11.2 0" stroke={tint} strokeWidth="2" strokeLinecap="round" />
          <circle cx="10" cy="13" r="1.6" fill={tint} />
        </svg>
        <div
          style={{
            marginLeft: 4,
            width: 26,
            height: 14,
            borderRadius: 4,
            border: `2px solid ${tint}`,
            opacity: 0.85,
            padding: 2
          }}
        >
          <div style={{ ...bar, width: '72%', height: '100%', borderRadius: 1.5 }} />
        </div>
      </div>
    </div>
  );
}

export default function Phone({
  children,
  enter = 1,
  background = brand.white,
  statusTint = brand.ink,
  x = phone.x,
  y = phone.y,
  showStatusBar = true
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: phone.width,
        height: phone.height,
        borderRadius: phone.radius,
        // The body is near-black with a hairline highlight, which is what reads
        // as "metal edge" at this size — a gradient bezel just looks muddy.
        background: `linear-gradient(160deg, #35393C 0%, #0C0E0F 42%, #16191B 100%)`,
        padding: phone.bezel,
        boxShadow: shadow.device,
        opacity: interpolate(enter, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateY(${interpolate(enter, [0, 1], [70, 0])}px) scale(${interpolate(enter, [0, 1], [0.95, 1])})`,
        transformOrigin: 'center bottom'
      }}
    >
      <div
        style={{
          position: 'relative',
          width: screen.width,
          height: screen.height,
          borderRadius: screen.radius,
          overflow: 'hidden',
          background,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {showStatusBar ? <StatusBar tint={statusTint} /> : null}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>

        {/* Dynamic island. Drawn over the UI, not reserved from it, the way the
            real one sits above a scrolling list. */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 132,
            height: 36,
            borderRadius: 18,
            background: '#000'
          }}
        />
        {/* Home indicator. */}
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 148,
            height: 6,
            borderRadius: 3,
            background: 'rgba(0,0,0,0.30)'
          }}
        />
      </div>
    </div>
  );
}
