// The app's top chrome: the AS Store lockup, a search pill, and the bag.
//
// Simplified from `mobile/src/components/AppHeader.jsx` to the three things a
// viewer registers in four seconds. The search pill is here because the Shop
// tab really does lead with it, and because it sets up the assistant scene
// later — the app has two ways to find something, and this is the plain one.

import React from 'react';
import { Img, staticFile } from 'remotion';
import { brand } from '../brand';
import Icon from './Icon';

export const HEADER_HEIGHT = 108;

export default function AppHeader({ title = null, placeholder = 'Search AS Store', tone = 'light' }) {
  const dark = tone === 'dark';
  const fg = dark ? brand.white : brand.ink;

  return (
    <div
      style={{
        height: HEADER_HEIGHT,
        flexShrink: 0,
        background: dark ? brand.ink : brand.white,
        borderBottom: `1px solid ${dark ? brand.inkLine : 'rgba(21,24,26,0.08)'}`,
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        // Clears the dynamic island, which is drawn over the UI rather than
        // reserved from it.
        paddingTop: 22
      }}
    >
      {title ? (
        <span style={{ fontSize: 26, fontWeight: 800, color: fg, letterSpacing: -0.4, flex: 1 }}>{title}</span>
      ) : (
        <>
          <Img
            src={staticFile('brand/as-store-logo.png')}
            style={{ height: 40, width: 'auto', objectFit: 'contain' }}
          />
          <div
            style={{
              flex: 1,
              height: 48,
              borderRadius: 24,
              background: dark ? brand.inkSoft : brand.fog,
              border: `1px solid ${dark ? brand.inkLine : 'rgba(21,24,26,0.08)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0 16px'
            }}
          >
            <Icon name="search" size={21} color={dark ? 'rgba(255,255,255,0.55)' : 'rgba(21,24,26,0.42)'} />
            <span
              style={{
                fontSize: 17,
                fontWeight: 500,
                color: dark ? 'rgba(255,255,255,0.55)' : 'rgba(21,24,26,0.42)'
              }}
            >
              {placeholder}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
