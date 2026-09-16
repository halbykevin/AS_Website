// Beat 1 — stop the scroll.
//
// Three words, stamped one at a time, that are also the reel's structure: the
// store, the rewards, the events. They come back on the closing card, so the
// viewer is handed a shape at second one and sees it closed at second 28.
//
// Type rather than footage, because the first frame of a Reel is seen at thumb
// speed and a phone mockup at that size is an indistinct grey rectangle. A word
// is legible at any size.

import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { brand, safe } from '../brand';
import { fadeUp, SPRING, useEnter, useSceneFade } from '../lib/anim';

const WORDS = [
  { text: 'SHOP.', color: brand.white },
  { text: 'WIN.', color: brand.amber },
  { text: 'GO OUT.', color: brand.redLight }
];

// Overshoots more than the rest of the reel — this is the one place where a
// bounce reads as confidence rather than as wobble.
const STAMP = { damping: 13, stiffness: 220, mass: 0.8 };

function Word({ text, color, delay }) {
  const enter = useEnter(delay, STAMP);
  return (
    <div
      style={{
        fontSize: 156,
        lineHeight: 1.02,
        fontWeight: 800,
        letterSpacing: -6,
        color,
        opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `scale(${interpolate(enter, [0, 1], [1.28, 1])})`,
        transformOrigin: 'left center'
      }}
    >
      {text}
    </div>
  );
}

export default function Hook({ duration }) {
  const frame = useCurrentFrame();
  const opacity = useSceneFade(duration);
  const tail = useEnter(42, SPRING);

  // The rule under the words draws itself left-to-right as the last word lands.
  const rule = interpolate(frame, [26, 44], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={{ position: 'absolute', left: safe.side, top: 548 }}>
        {WORDS.map((word, i) => (
          <Word key={word.text} text={word.text} color={word.color} delay={4 + i * 8} />
        ))}

        <div
          style={{
            marginTop: 40,
            width: 300,
            height: 8,
            borderRadius: 4,
            background: brand.red,
            transform: `scaleX(${rule})`,
            transformOrigin: 'left center'
          }}
        />

        <div style={{ ...fadeUp(tail, 30), marginTop: 44, display: 'flex', alignItems: 'center', gap: 26 }}>
          <Img
            src={staticFile('brand/app-icon.png')}
            style={{
              width: 118,
              height: 118,
              borderRadius: 27,
              // Store icons are drawn on a white card; on ink it needs an edge
              // or it floats without a shape.
              boxShadow: '0 12px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.10)'
            }}
          />
          <div>
            <div style={{ fontSize: 46, fontWeight: 800, color: brand.white, letterSpacing: -1.2 }}>
              AS Company
            </div>
            <div style={{ fontSize: 32, fontWeight: 600, color: brand.gray, marginTop: 4 }}>
              One app.
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
