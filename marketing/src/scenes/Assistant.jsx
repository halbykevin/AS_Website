// Beat 7 — the shop answers questions.
//
// The assistant's replies are grounded: the model looks products up with tools
// and returns slugs, and the client renders each one with its own product tile
// — live price, working Add to Bag. So the beat shows a sentence *and* a real
// card, because that is the actual shape of an answer. A chat bubble quoting a
// price the model typed would be advertising the one thing the product was
// built not to do.
//
// The laptop below is the real row at the real price, and the budget in the
// question is set above it on purpose.

import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { brand, type } from '../brand';
import { pick } from '../lib/catalogue';
import { fadeUp, popIn, SPRING, SPRING_HEAVY, useEnter, useSceneFade } from '../lib/anim';
import Caption from '../components/Caption';
import Icon from '../components/Icon';
import Phone from '../components/Phone';
import AppTabBar from '../components/AppTabBar';

const ASK_AT = 5;
const TYPING_FROM = 16;
const TYPING_TO = 36;
const REPLY_AT = 37;
const CARD_AT = 48;
const SECOND_CARD_AT = 57;

function Bubble({ children, mine = false, delay, style }) {
  const enter = useEnter(delay, SPRING);
  return (
    <div
      style={{
        ...fadeUp(enter, 18),
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '84%',
        padding: '14px 18px',
        borderRadius: 20,
        borderBottomRightRadius: mine ? 6 : 20,
        borderBottomLeftRadius: mine ? 20 : 6,
        background: mine ? brand.ink : brand.white,
        color: mine ? brand.white : brand.ink,
        fontSize: 20,
        lineHeight: 1.4,
        fontWeight: 500,
        boxShadow: mine ? 'none' : '0 3px 12px rgba(21,24,26,0.08)',
        ...style
      }}
    >
      {children}
    </div>
  );
}

function Typing({ visible }) {
  const frame = useCurrentFrame();
  if (!visible) return null;
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        display: 'flex',
        gap: 8,
        padding: '18px 20px',
        borderRadius: 20,
        borderBottomLeftRadius: 6,
        background: brand.white,
        boxShadow: '0 3px 12px rgba(21,24,26,0.08)'
      }}
    >
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            background: 'rgba(21,24,26,0.35)',
            transform: `translateY(${Math.sin((frame - TYPING_FROM) * 0.36 - i * 0.7) * 4}px)`
          }}
        />
      ))}
    </div>
  );
}

function AnswerCard({ product, delay }) {
  const enter = useEnter(delay, SPRING);
  return (
    <div
      style={{
        ...popIn(enter, 0.92),
        alignSelf: 'flex-start',
        width: '92%',
        display: 'flex',
        gap: 14,
        padding: 14,
        borderRadius: 20,
        background: brand.white,
        border: `1.5px solid rgba(164,30,34,0.18)`,
        boxShadow: '0 8px 22px rgba(21,24,26,0.10)'
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          flexShrink: 0,
          borderRadius: 14,
          background: brand.white,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}
      >
        <Img src={staticFile(product.image)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: brand.red, textTransform: 'uppercase' }}>
          {product.brand}
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: 18,
            lineHeight: 1.25,
            fontWeight: 600,
            color: brand.ink,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {product.name}
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: brand.red, letterSpacing: -0.6 }}>
              ${product.price}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(21,24,26,0.45)' }}>+ VAT</span>
          </div>
          <div
            style={{
              padding: '8px 16px',
              borderRadius: 18,
              background: brand.ink,
              color: brand.white,
              fontSize: 15,
              fontWeight: 700
            }}
          >
            Add to Bag
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Assistant({ duration }) {
  const frame = useCurrentFrame();
  const opacity = useSceneFade(duration);
  const enter = useEnter(0, SPRING_HEAVY);
  // Two results, because that is what the tools hand back — and the budget in
  // the question is set above both of these real prices on purpose.
  const first = pick('omnibook 16z', 'omnibook');
  const second = pick('omnibook 16t', 'probook');

  return (
    <AbsoluteFill style={{ opacity }}>
      <Caption
        kicker="Shopping assistant"
        lines={['Ask for what', 'you need.']}
        accent={1}
        size={type.headline}
      />

      <Phone enter={enter}>
        {/* Ink header with the assistant's own green — deliberately off-brand in
            the app, so the button reads as a thing to press rather than as
            decoration on a red-accented store. */}
        <div
          style={{
            height: 108,
            flexShrink: 0,
            paddingTop: 22,
            background: brand.ink,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '22px 20px 0'
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              background: brand.whatsapp,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Icon name="sparkle" size={23} color={brand.ink} filled strokeWidth={1.4} />
          </div>
          <div>
            <div style={{ fontSize: 21, fontWeight: 700, color: brand.white }}>Shopping assistant</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: brand.whatsapp }}>Online</div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            background: brand.fog,
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            overflow: 'hidden'
          }}
        >
          <Bubble mine delay={ASK_AT}>
            I need a laptop under $800 for work
          </Bubble>

          <Typing visible={frame >= TYPING_FROM && frame < TYPING_TO} />

          {frame >= REPLY_AT ? (
            <Bubble delay={REPLY_AT}>
              Two that fit your budget:
            </Bubble>
          ) : null}

          {frame >= CARD_AT ? <AnswerCard product={first} delay={CARD_AT} /> : null}
          {frame >= SECOND_CARD_AT ? <AnswerCard product={second} delay={SECOND_CARD_AT} /> : null}

          <div
            style={{
              marginTop: 'auto',
              height: 54,
              borderRadius: 27,
              background: brand.white,
              border: '1px solid rgba(21,24,26,0.10)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 8px 0 20px'
            }}
          >
            <span style={{ fontSize: 17, color: 'rgba(21,24,26,0.40)', fontWeight: 500 }}>Ask anything…</span>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                background: brand.red,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Icon name="arrowRight" size={21} color={brand.white} strokeWidth={2.4} />
            </div>
          </div>
        </div>

        <AppTabBar active="shop" cartCount={1} />
      </Phone>
    </AbsoluteFill>
  );
}
