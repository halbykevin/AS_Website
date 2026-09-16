// The app's real bottom tab bar: Home · Shop · Bag · Events · Account.
//
// Rebuilt from `mobile/src/components/TabBar.jsx` — rounded top corners with a
// lifted shadow, a brand-tinted active pill behind the focused tab, outline
// icons that fill when focused, and a live count badge on the Bag. The order
// and the labels are the app's, because this is the one piece of chrome a
// viewer will look for after installing.

import React from 'react';
import { brand, phone, screen } from '../brand';
import Icon from './Icon';
import { STATUS_BAR } from './Phone';

export const TABS = [
  { key: 'index', label: 'Home', icon: 'storefront' },
  { key: 'shop', label: 'Shop', icon: 'grid' },
  { key: 'bag', label: 'Bag', icon: 'bag' },
  { key: 'events', label: 'Events', icon: 'calendar' },
  { key: 'account', label: 'Account', icon: 'person' }
];

export const TAB_BAR_HEIGHT = 124;
const ICON_CENTER_FROM_TOP = 44;

/**
 * Where the Bag icon sits, in *canvas* coordinates.
 *
 * The add-to-bag flight has to land on it, and the flying photo is rendered
 * outside the phone (an element inside a clipped screen cannot fly over the
 * bezel). Derived from the layout constants rather than measured, so moving the
 * phone moves the landing spot with it — the same bug the app solved by having
 * the bag register itself as a target.
 */
export const bagCenter = () => ({
  x: phone.x + phone.bezel + screen.width / 2,
  y: phone.y + phone.bezel + STATUS_BAR + (screen.height - STATUS_BAR - TAB_BAR_HEIGHT) + ICON_CENTER_FROM_TOP
});

function Badge({ count, scale = 1 }) {
  if (!count) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: -9,
        right: -13,
        minWidth: 26,
        height: 26,
        padding: '0 7px',
        borderRadius: 13,
        background: brand.red,
        color: brand.white,
        fontSize: 16,
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `2.5px solid ${brand.white}`,
        transform: `scale(${scale})`
      }}
    >
      {count}
    </div>
  );
}

export default function AppTabBar({ active = 'shop', cartCount = 0, badgeScale = 1, pillProgress = 1 }) {
  return (
    <div
      style={{
        height: TAB_BAR_HEIGHT,
        flexShrink: 0,
        background: brand.white,
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        boxShadow: '0 -8px 26px rgba(21,24,26,0.10)',
        display: 'flex',
        alignItems: 'flex-start',
        paddingTop: 14,
        paddingBottom: 30
      }}
    >
      {TABS.map(tab => {
        const focused = tab.key === active;
        const color = focused ? brand.red : 'rgba(21,24,26,0.40)';
        return (
          <div
            key={tab.key}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 7,
              position: 'relative'
            }}
          >
            {/* The active indicator pill — Material 3's pattern, and the app's. */}
            {focused ? (
              <div
                style={{
                  position: 'absolute',
                  top: -4,
                  width: 64,
                  height: 38,
                  borderRadius: 19,
                  background: brand.blush,
                  transform: `scaleX(${pillProgress})`,
                  opacity: pillProgress
                }}
              />
            ) : null}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <Icon name={tab.icon} size={27} color={color} filled={focused} strokeWidth={focused ? 1.6 : 1.8} />
              {tab.key === 'bag' ? <Badge count={cartCount} scale={badgeScale} /> : null}
            </div>
            <span
              style={{
                zIndex: 1,
                fontSize: 16,
                fontWeight: focused ? 700 : 600,
                color,
                letterSpacing: -0.1
              }}
            >
              {tab.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
