// The one backdrop the whole reel sits on.
//
// Rendered once, above nothing and below everything, so scene changes are cuts
// in the *content* rather than in the background. That is what lets each scene
// fade its own contents at both edges and read as a cross-dissolve, with no
// overlapping sequences to keep in step.
//
// Ink, not black: black clips on an OLED phone and makes the phone mockup's own
// body disappear into the frame. The red glow drifts slowly the whole way
// through — a still gradient behind 28 seconds of motion looks like a freeze.

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { brand } from '../brand';
import { DURATION } from '../config';

export default function Background() {
  const frame = useCurrentFrame();
  const t = frame / DURATION;

  // One slow pass across and down, plus a gentle breath on the radius.
  const x = 50 + Math.sin(t * Math.PI * 2) * 18;
  const y = 34 + Math.cos(t * Math.PI * 1.4) * 14;
  const size = 62 + Math.sin(t * Math.PI * 3) * 6;

  return (
    <AbsoluteFill style={{ background: brand.ink }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(${size}% ${size}% at ${x}% ${y}%, rgba(164,30,34,0.42) 0%, rgba(130,22,26,0.14) 42%, rgba(21,24,26,0) 72%)`
        }}
      />
      {/* A vignette to hold the eye in the middle third, where the phone is. */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(120% 78% at 50% 46%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.55) 100%)'
        }}
      />
    </AbsoluteFill>
  );
}
