// Beat 8 — the ask.
//
// Closes on the three words the reel opened with, so the last frame and the
// first frame are the same promise.
//
// What it asks for depends on `stores` in `src/config.js`, and both listings
// are off by default. An advert that says "Download on the App Store" while the
// listing is a draft sends every viewer it converts to a dead end — the worst
// possible outcome for a launch reel, and the easiest one to ship by accident.
// Turn each store on the day its listing is public and this card rewords
// itself.
//
// The store buttons are plain pills with the stores' names in text, not their
// official badges. Those badges are trademarked artwork with their own rules
// about size, spacing and wording; an approximation drawn here would breach
// them. Drop the real assets in and swap them when the listings go live.

import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { brand, safe } from '../brand';
import { cta, stores } from '../config';
import { fadeUp, popIn, SPRING, useEnter, useSceneFade } from '../lib/anim';

const WORDS = [
  { text: 'SHOP', color: brand.white },
  { text: 'WIN', color: brand.amber },
  { text: 'GO OUT', color: brand.redLight }
];

function StorePill({ name, delay }) {
  const enter = useEnter(delay, SPRING);
  return (
    <div
      style={{
        ...fadeUp(enter, 20),
        padding: '20px 34px',
        borderRadius: 18,
        background: brand.white,
        color: brand.ink,
        fontSize: 32,
        fontWeight: 800,
        letterSpacing: -0.6
      }}
    >
      {name}
    </div>
  );
}

export default function Cta({ duration }) {
  const opacity = useSceneFade(duration, { outFrames: 2 });
  const icon = useEnter(2, { damping: 13, stiffness: 180, mass: 0.8 });
  const name = useEnter(12, SPRING);
  const words = useEnter(20, SPRING);
  const ask = useEnter(32, SPRING);
  const site = useEnter(44, SPRING);

  const live = [stores.android && 'Google Play', stores.ios && 'App Store'].filter(Boolean);

  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: 'absolute',
          left: safe.side,
          right: safe.side,
          top: 556,
          textAlign: 'center'
        }}
      >
        <Img
          src={staticFile('brand/app-icon.png')}
          style={{
            ...popIn(icon, 0.6),
            width: 236,
            height: 236,
            borderRadius: 54,
            boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.10)'
          }}
        />

        <div
          style={{
            ...fadeUp(name, 26),
            marginTop: 34,
            fontSize: 82,
            fontWeight: 800,
            letterSpacing: -3,
            color: brand.white
          }}
        >
          AS Company
        </div>

        <div
          style={{
            ...fadeUp(words, 22),
            marginTop: 18,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 20,
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: -0.6
          }}
        >
          {WORDS.map((word, i) => (
            <span key={word.text} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              {i > 0 ? <span style={{ color: 'rgba(255,255,255,0.28)' }}>·</span> : null}
              <span style={{ color: word.color }}>{word.text}</span>
            </span>
          ))}
        </div>

        <div
          style={{
            ...fadeUp(ask, 24),
            marginTop: 54,
            fontSize: 46,
            fontWeight: 700,
            color: brand.white,
            letterSpacing: -1
          }}
        >
          {live.length ? cta.live : cta.soon}
        </div>

        {live.length ? (
          <div style={{ marginTop: 26, display: 'flex', justifyContent: 'center', gap: 18 }}>
            {live.map((store, i) => (
              <StorePill key={store} name={store} delay={38 + i * 4} />
            ))}
          </div>
        ) : null}

        <div
          style={{
            ...fadeUp(site, 20),
            marginTop: live.length ? 34 : 28,
            fontSize: 38,
            fontWeight: 700,
            color: brand.redLight,
            letterSpacing: 0.4
          }}
        >
          {cta.site}
        </div>
      </div>
    </AbsoluteFill>
  );
}
