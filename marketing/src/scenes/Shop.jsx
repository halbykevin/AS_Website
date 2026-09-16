// Beat 2 — the catalogue is the product.
//
// The longest beat in the reel, because this is the reason most people install.
// Nothing happens except scrolling, on purpose: a grid of real hardware at real
// prices moving under a thumb is the offer, and any transition laid over it
// would be the video talking about itself instead.
//
// The products are the live catalogue (see `npm run content`), which is why the
// prices are odd numbers. Round ones read as mocked up.

import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { brand, screen, type } from '../brand';
import { catalogueClaim, products } from '../lib/catalogue';
import { SPRING_HEAVY, useEnter, useSceneFade } from '../lib/anim';
import AppHeader from '../components/AppHeader';
import AppTabBar from '../components/AppTabBar';
import Caption from '../components/Caption';
import Phone from '../components/Phone';
import ProductTile from '../components/ProductTile';

const PADDING = 16;
const GAP = 14;
const TILE_WIDTH = (screen.width - PADDING * 2 - GAP) / 2;

export default function Shop({ duration }) {
  const frame = useCurrentFrame();
  const opacity = useSceneFade(duration);
  const enter = useEnter(0, SPRING_HEAVY);

  // One long, eased scroll. Starts a beat after the phone lands so the viewer
  // registers a still screen first — motion from frame 0 reads as a video of a
  // video, not as someone scrolling.
  const scrollY = interpolate(frame, [10, duration - 6], [0, -1680], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.ease)
  });

  const rows = [];
  for (let i = 0; i < products.length; i += 2) rows.push(products.slice(i, i + 2));

  return (
    <AbsoluteFill style={{ opacity }}>
      <Caption
        kicker="AS Store"
        lines={['The whole shop.', `${catalogueClaim()} products.`]}
        accent={1}
        size={type.headline}
      />

      <Phone enter={enter}>
        <AppHeader />
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden', background: brand.fog }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              padding: PADDING,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              transform: `translateY(${scrollY}px)`
            }}
          >
            {rows.map(row => (
              <div key={row.map(p => p.id).join('-')} style={{ display: 'flex', gap: GAP }}>
                {row.map(product => (
                  <ProductTile key={product.id} product={product} width={TILE_WIDTH} />
                ))}
              </div>
            ))}
          </div>

          {/* The header casts over the list as it scrolls under it, the way a
              sticky header does in the app. */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 26,
              background: `linear-gradient(${brand.fog}, rgba(245,245,247,0))`
            }}
          />
        </div>
        <AppTabBar active="shop" />
      </Phone>
    </AbsoluteFill>
  );
}

