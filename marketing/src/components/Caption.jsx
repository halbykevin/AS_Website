// The burned-in caption every scene carries.
//
// Reels are watched muted by default, so the caption is not a subtitle — it is
// the argument, and the picture illustrates it. Two consequences shape this
// component: it is *top*-anchored, because Instagram's own caption, audio strip
// and profile row cover the bottom of the frame; and nothing in it is small.
//
// Lines stagger rather than appearing together, which gives the eye an order to
// read them in at the speed a thumb is moving.

import React from 'react';
import { brand, safe, type } from '../brand';
import { fadeUp, useEnter } from '../lib/anim';

function Kicker({ children, delay, color }) {
  const enter = useEnter(delay);
  return (
    <div
      style={{
        ...fadeUp(enter, 22),
        fontSize: type.micro,
        fontWeight: 800,
        letterSpacing: 4.5,
        textTransform: 'uppercase',
        color,
        marginBottom: 18
      }}
    >
      {children}
    </div>
  );
}

function Line({ children, delay, color, size }) {
  const enter = useEnter(delay);
  return (
    <div
      style={{
        ...fadeUp(enter, 34),
        fontSize: size,
        lineHeight: 1.06,
        fontWeight: 800,
        letterSpacing: -2.2,
        color
      }}
    >
      {children}
    </div>
  );
}

export default function Caption({
  kicker,
  lines = [],
  /** Index of the line painted in the accent colour — usually the claim itself. */
  accent = -1,
  accentColor = brand.redLight,
  color = brand.white,
  kickerColor = brand.gray,
  size = type.headline,
  delay = 2,
  align = 'left',
  top = safe.top
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: safe.side,
        // The action rail down the right of a Reel eats real estate, so text
        // stops well short of the frame edge rather than tucking under it.
        right: safe.right,
        textAlign: align,
        ...(align === 'center' ? { right: safe.side } : null)
      }}
    >
      {kicker ? (
        <Kicker delay={delay} color={kickerColor}>
          {kicker}
        </Kicker>
      ) : null}
      {lines.map((text, i) => (
        <Line
          key={text}
          delay={delay + (kicker ? 4 : 0) + i * 5}
          size={size}
          color={i === accent ? accentColor : color}
        >
          {text}
        </Line>
      ))}
    </div>
  );
}
