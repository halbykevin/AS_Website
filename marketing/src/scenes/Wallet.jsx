// Beat 4 — the money reason to install.
//
// Out of the phone and onto the frame. Four device shots in a row start to read
// as a product tour, and this is the one beat that is an *offer* rather than a
// feature: it wants the whole screen and the biggest number in the reel.
//
// The number is the live rate (`wallet_settings.earn_percent`, 5%) applied to a
// round example, not an invented headline. The closing line is the actual
// difference from the points scheme this replaced: dollars, spendable at
// checkout, with nothing to redeem first.

import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { brand, safe, type } from '../brand';
import { claims } from '../config';
import { fadeUp, money, popIn, SPRING, useCountUp, useEnter, useSceneFade } from '../lib/anim';
import Caption from '../components/Caption';
import Icon from '../components/Icon';

const CARD_WIDTH = 1080 - safe.side * 2;

function LedgerRow({ label, amount, delay }) {
  const enter = useEnter(delay, SPRING);
  return (
    <div
      style={{
        ...fadeUp(enter, 20),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 26px',
        borderRadius: 18,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.09)'
      }}
    >
      <span style={{ fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.72)' }}>{label}</span>
      <span style={{ fontSize: 32, fontWeight: 800, color: brand.amber }}>{amount}</span>
    </div>
  );
}

export default function Wallet({ duration }) {
  const frame = useCurrentFrame();
  const opacity = useSceneFade(duration);
  const card = useEnter(6, SPRING);
  const tail = useEnter(52, SPRING);

  const earned = (claims.walletExampleSpend * claims.walletEarnPercent) / 100;
  const balance = useCountUp(earned, { delay: 16, duration: 38 });

  return (
    <AbsoluteFill style={{ opacity }}>
      <Caption kicker="AS Wallet" lines={['Every order', 'pays you back.']} accent={1} size={type.headline} />

      <div style={{ position: 'absolute', left: safe.side, top: 640, width: CARD_WIDTH }}>
        {/* The card. Ink with a red bloom in the corner — the same treatment the
            app gives the wallet screen, so the balance reads as money and not
            as a statistic. */}
        <div
          style={{
            ...popIn(card, 0.9),
            padding: 44,
            borderRadius: 40,
            background: `linear-gradient(135deg, ${brand.inkSoft} 0%, ${brand.ink} 62%), radial-gradient(70% 120% at 100% 0%, rgba(164,30,34,0.85), rgba(21,24,26,0) 70%)`,
            backgroundBlendMode: 'screen',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 40px 90px rgba(0,0,0,0.55)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: 4,
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.62)'
              }}
            >
              AS Wallet
            </span>
            <Icon name="wallet" size={54} color={brand.redLight} strokeWidth={1.9} />
          </div>

          <div
            style={{
              marginTop: 26,
              fontSize: 168,
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: -7,
              color: brand.white
            }}
          >
            {money(balance)}
          </div>
          <div style={{ marginTop: 10, fontSize: 32, fontWeight: 600, color: 'rgba(255,255,255,0.60)' }}>
            Store credit — spend it like cash
          </div>
        </div>

        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <LedgerRow
            label={`Spend $${claims.walletExampleSpend.toLocaleString('en-US')}`}
            amount={`+ ${money(earned)}`}
            delay={30}
          />
        </div>

        <div
          style={{
            ...fadeUp(tail, 26),
            marginTop: 34,
            fontSize: 42,
            lineHeight: 1.26,
            fontWeight: 700,
            color: brand.white,
            letterSpacing: -1
          }}
        >
          No points. No redeeming.
          <br />
          <span style={{ color: brand.gray, fontWeight: 600 }}>Just dollars off your next order.</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
