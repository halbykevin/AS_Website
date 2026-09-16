// Beat 5 — the reason to come back tomorrow.
//
// The wheel is the app's real one: the slices, their labels, their colours and
// their order all come from `GET /api/spin` on the live store (see
// `npm run content`), drawn with the same geometry module the app and the CMS
// preview share. A prettier invented wheel would be an advert for a feature
// that doesn't exist.
//
// Labels radiate outward and so half of them are upside down at any moment.
// That is the app's behaviour too — `labelAngle` is copied, not reinterpreted —
// and a wheel whose text stayed upright would be the giveaway that this is a
// rendering rather than the product.

import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { brand, safe, type } from '../brand';
import { claims } from '../config';
import { wheel } from '../lib/catalogue';
import { labelAngle, readableOn, slicePath, turnsTo } from '../lib/wheel';
import { fadeUp, popIn, SPRING, useEnter, useSceneFade } from '../lib/anim';
import Caption from '../components/Caption';

const CX = 540;
const CY = 952;
const R = 366;

const SPIN_FROM = 6;
const SPIN_TO = 84;

// The slice the wheel lands on. Named rather than indexed so re-running
// `npm run content` cannot silently land the advert on "Try your luck again".
const WINNER_LABEL = '10% Off';

export default function Spin({ duration }) {
  const frame = useCurrentFrame();
  const opacity = useSceneFade(duration);
  const enter = useEnter(0, SPRING);

  const slices = wheel.slices;
  const count = slices.length;
  const winner = Math.max(0, slices.findIndex(s => s.label === WINNER_LABEL));

  // Fast, then a long decel — a wheel that eases symmetrically reads as a
  // carousel. The curve is what sells it as weight coming to rest.
  const progress = interpolate(frame, [SPIN_FROM, SPIN_TO], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.08, 0.82, 0.12, 1)
  });
  const rotation = (turnsTo(winner, count) * progress * 180) / Math.PI;

  const landed = frame >= SPIN_TO - 2;
  const win = useEnter(SPIN_TO - 2, { damping: 12, stiffness: 200, mass: 0.7 });
  const footnote = useEnter(SPIN_TO + 6, SPRING);

  return (
    <AbsoluteFill style={{ opacity }}>
      <Caption kicker="Daily Spin" lines={['A free spin,', 'every day.']} accent={1} size={type.headline} />

      <div style={{ ...popIn(enter, 0.88), position: 'absolute', inset: 0 }}>
        <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
          {/* Glow under the wheel, so it lifts off the ink rather than sitting on it. */}
          <defs>
            <radialGradient id="wheelGlow">
              <stop offset="0%" stopColor="rgba(164,30,34,0.55)" />
              <stop offset="100%" stopColor="rgba(164,30,34,0)" />
            </radialGradient>
          </defs>
          <circle cx={CX} cy={CY} r={R * 1.45} fill="url(#wheelGlow)" />

          <g transform={`rotate(${rotation} ${CX} ${CY})`}>
            {slices.map((slice, i) => (
              <path
                key={`${slice.label}-${i}`}
                d={slicePath(i, count, CX, CY, R)}
                fill={slice.color}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={2}
              />
            ))}
            {slices.map((slice, i) => {
              // Long prize names are shrunk to fit the spoke rather than cut:
              // a truncated prize is a different prize.
              const size = Math.max(15, Math.min(27, Math.round((27 * 13) / Math.max(13, slice.label.length))));
              return (
                <g key={`label-${slice.label}-${i}`} transform={`rotate(${labelAngle(i, count)} ${CX} ${CY})`}>
                  <text
                    x={CX + R - 26}
                    y={CY}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fill={readableOn(slice.color)}
                    style={{ fontSize: size, fontWeight: 800, letterSpacing: -0.2 }}
                  >
                    {slice.label}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Rim and hub, drawn outside the rotating group so they stay put. */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={6} />
          <circle cx={CX} cy={CY} r={66} fill={brand.white} />
          <text
            x={CX}
            y={CY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={brand.red}
            style={{ fontSize: 30, fontWeight: 800, letterSpacing: 1 }}
          >
            SPIN
          </text>

          {/* Pointer, at 12 o'clock, biting into the rim. */}
          <path
            d={`M ${CX - 30} ${CY - R - 34} L ${CX + 30} ${CY - R - 34} L ${CX} ${CY - R + 22} Z`}
            fill={brand.white}
            stroke={brand.ink}
            strokeWidth={3}
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* What the spin was worth. */}
      <div
        style={{
          position: 'absolute',
          left: safe.side,
          right: safe.side,
          top: 1382,
          display: 'flex',
          justifyContent: 'center',
          opacity: landed ? 1 : 0
        }}
      >
        <div
          style={{
            ...popIn(win, 0.7),
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '20px 38px',
            borderRadius: 999,
            background: brand.white,
            boxShadow: '0 20px 50px rgba(0,0,0,0.45)'
          }}
        >
          <span style={{ fontSize: 52, fontWeight: 800, color: brand.red, letterSpacing: -1.4 }}>
            {WINNER_LABEL.toUpperCase()}
          </span>
          <span style={{ fontSize: 30, fontWeight: 700, color: 'rgba(21,24,26,0.55)' }}>
            voucher added
          </span>
        </div>
      </div>

      <div
        style={{
          ...fadeUp(footnote, 18),
          position: 'absolute',
          left: safe.side,
          right: safe.side,
          top: 1490,
          textAlign: 'center',
          fontSize: 30,
          fontWeight: 600,
          color: brand.gray
        }}
      >
        Every {claims.spinCooldownHours} hours, free, for signed-in customers.
      </div>
    </AbsoluteFill>
  );
}
