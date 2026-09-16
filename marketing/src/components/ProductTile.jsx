// A product card, as the app draws one.
//
// Ported from `mobile/src/components/ProductTile.jsx`: soft card with a faint
// red border, brand eyebrow, two-line name, the photo on white, the price in
// brand red with the `+ VAT` tag beside it, and an Add-to-Bag pill. The photo
// sits on white because AS product photography is shot on white — anything
// tinted behind it frames the shot's own background as a visible rectangle.
//
// `+ VAT` is not decoration: VAT is 11% and added at checkout, and the app says
// so wherever it prints a price. An advert quoting the bare number would be
// quoting a price nobody pays.

import React from 'react';
import { Img, staticFile } from 'remotion';
import { brand } from '../brand';

const money = value => `$${Number(value).toLocaleString('en-US')}`;

export default function ProductTile({ product, width, imageHeight = 168, dimmed = false, highlight = false }) {
  return (
    <div
      style={{
        width,
        background: brand.white,
        borderRadius: 22,
        border: `1.5px solid ${highlight ? brand.red : 'rgba(164,30,34,0.16)'}`,
        boxShadow: highlight ? '0 14px 34px rgba(164,30,34,0.22)' : '0 6px 18px rgba(21,24,26,0.06)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: dimmed ? 0.45 : 1,
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: brand.red,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {product.brand}
      </div>

      <div
        style={{
          height: imageHeight,
          background: brand.white,
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}
      >
        <Img
          src={staticFile(product.image)}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      </div>

      <div
        style={{
          fontSize: 19,
          lineHeight: 1.28,
          fontWeight: 600,
          color: brand.ink,
          // Two lines, always — the app pins the text block's height so its grid
          // can hand FlatList a getItemLayout instead of measuring 1,300 cells.
          height: 19 * 1.28 * 2,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical'
        }}
      >
        {product.name}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span style={{ fontSize: 27, fontWeight: 800, color: brand.red, letterSpacing: -0.6 }}>
          {money(product.price)}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(21,24,26,0.45)' }}>+ VAT</span>
      </div>

      <div
        style={{
          marginTop: 2,
          height: 44,
          borderRadius: 22,
          background: highlight ? brand.red : brand.ink,
          color: brand.white,
          fontSize: 17,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        Add to Bag
      </div>
    </div>
  );
}
