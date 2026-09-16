// Beat 3 — how little work buying is.
//
// The product photo arcs out of the page and lands on the bag, and the badge
// pops as the count rises. That is the app's real `FlyToCart` behaviour, and it
// is reproduced here for the same structural reason it exists there: the photo
// starts inside the screen and ends on the chrome, so it cannot be drawn by
// either one. Here it is rendered above the phone entirely — an element inside
// the screen's clipping box cannot fly over the bezel.

import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { brand, phone, screen, type } from '../brand';
import { claims } from '../config';
import { pick } from '../lib/catalogue';
import { SPRING_HEAVY, useEnter, usePulse, useSceneFade } from '../lib/anim';
import AppHeader from '../components/AppHeader';
import AppTabBar, { bagCenter } from '../components/AppTabBar';
import Caption from '../components/Caption';
import Icon from '../components/Icon';
import Phone from '../components/Phone';

const PRESS_AT = 24;
const FLY_AT = 28;
const FLY_LENGTH = 26;
const LAND_AT = FLY_AT + FLY_LENGTH;

// Where the photo starts, in canvas coordinates: the middle of the product
// image block. Derived from the layout below rather than measured, the way the
// tab bar's landing spot is.
const PHOTO = { top: 196, height: 400 };
const start = () => ({
  x: phone.x + phone.bezel + screen.width / 2,
  y: phone.y + phone.bezel + PHOTO.top + PHOTO.height / 2
});

function Row({ icon, children, color = brand.ink, background = brand.fog }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 14px',
        borderRadius: 14,
        background,
        color,
        fontSize: 17,
        fontWeight: 700
      }}
    >
      <Icon name={icon} size={20} color={color} />
      <span>{children}</span>
    </div>
  );
}

export default function Bag({ duration }) {
  const frame = useCurrentFrame();
  const opacity = useSceneFade(duration);
  const enter = useEnter(0, SPRING_HEAVY);
  const product = pick('xtreme', 'bose');

  // What the app promises back on this order, using the live 5% rate. It has to
  // agree with the wallet beat two scenes later, so both read `claims`.
  const cashback = (product.price * claims.walletEarnPercent) / 100;

  const pressed = frame >= PRESS_AT && frame < PRESS_AT + 8;
  const inCart = frame >= LAND_AT;
  const badgeScale = usePulse(LAND_AT, { amount: 0.5, length: 12 });

  // The flight. Eased in both directions — a linear arc reads as a slide, and
  // the whole illusion is that the photo was thrown.
  const t = interpolate(frame, [FLY_AT, LAND_AT], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.quad)
  });
  const from = start();
  const to = bagCenter();
  const flying = frame >= FLY_AT && frame <= LAND_AT;
  // Bulged sideways: the two points sit on the same vertical, and a straight
  // drop down the middle of the frame looks like a bug rather than a throw.
  const flyX = from.x + (to.x - from.x) * t + Math.sin(t * Math.PI) * 120;
  const flyY = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 90;
  const flyScale = interpolate(t, [0, 1], [1, 0.16]);

  return (
    <AbsoluteFill style={{ opacity }}>
      <Caption kicker="Checkout" lines={['One tap to buy.', 'Cash on delivery.']} accent={1} size={type.headline} />

      <Phone enter={enter}>
        <AppHeader title={product.brand} />

        <div style={{ flex: 1, background: brand.white, padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              height: PHOTO.height,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: flying || inCart ? 0.18 : 1
            }}
          >
            <Img
              src={staticFile(product.image)}
              style={{ maxWidth: '92%', maxHeight: '92%', objectFit: 'contain' }}
            />
          </div>

          <div style={{ fontSize: 24, lineHeight: 1.3, fontWeight: 600, color: brand.ink }}>{product.name}</div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 12 }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: brand.red, letterSpacing: -1.4 }}>
              ${product.price}
            </span>
            <span style={{ fontSize: 19, fontWeight: 700, color: 'rgba(21,24,26,0.45)' }}>+ VAT</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
            <Row icon="wallet" color={brand.redDark} background={brand.blush}>
              Get ${cashback.toFixed(2)} back in AS Wallet
            </Row>
            <Row icon="check">Free delivery over $100</Row>
          </div>

          <div
            style={{
              marginTop: 'auto',
              marginBottom: 24,
              height: 68,
              borderRadius: 34,
              background: inCart ? brand.ink : brand.red,
              color: brand.white,
              fontSize: 24,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              transform: `scale(${pressed ? 0.955 : 1})`,
              boxShadow: pressed ? 'none' : '0 12px 26px rgba(164,30,34,0.35)'
            }}
          >
            {inCart ? <Icon name="check" size={24} color={brand.white} strokeWidth={2.6} /> : null}
            {inCart ? 'Added to Bag' : 'Add to Bag'}
          </div>
        </div>

        <AppTabBar active="shop" cartCount={inCart ? 1 : 0} badgeScale={badgeScale} />
      </Phone>

      {/* The flight itself, above the phone so it can cross the bezel. */}
      {flying ? (
        // Product photography is shot on white, so the thing in flight is a
        // little white card rather than a cut-out — giving it a radius and a
        // shadow makes that read as a tile leaving the page instead of as a
        // rectangle with a hard edge.
        <div
          style={{
            position: 'absolute',
            left: flyX,
            top: flyY,
            width: 320,
            height: 320,
            marginLeft: -160,
            marginTop: -160,
            borderRadius: 40,
            background: brand.white,
            padding: 22,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${flyScale}) rotate(${t * 26}deg)`,
            boxShadow: '0 22px 50px rgba(0,0,0,0.45)'
          }}
        >
          <Img
            src={staticFile(product.image)}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
