// Geometry for the Daily Spin wheel.
//
// A third deliberate copy of `mobile/src/lib/wheel.js` (itself a copy of
// `as_store/src/lib/wheel.js`, so the admin preview and the customer's wheel
// land on the same slice). The reel joins that rule for the same reason the
// other two exist: the wheel a viewer sees in an advert has to be the wheel
// they meet in the app, down to which slice sits under the pointer at rest.
// Change one, change all three.
//
// Convention: slice 0 starts at 12 o'clock and they run clockwise, so the
// pointer at the top of the wheel is over slice 0 at rest.

export const TAU = Math.PI * 2;

export const sliceAngle = count => (count > 0 ? TAU / count : TAU);

export const sliceStart = (i, count) => i * sliceAngle(count) - Math.PI / 2;

export function slicePath(i, count, cx, cy, r) {
  if (count <= 1) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  const a0 = sliceStart(i, count);
  const a1 = a0 + sliceAngle(count);
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const largeArc = sliceAngle(count) > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} Z`;
}

export const labelAngle = (i, count) => ((sliceStart(i, count) + sliceAngle(count) / 2) * 180) / Math.PI;

export function readableOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const channel = c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return L > 0.45 ? '#15181A' : '#ffffff';
}

/**
 * Radians to turn so slice `index` ends under the pointer.
 *
 * The app's version takes a random jitter — a wheel that stops dead-centre on
 * every slice reads as staged. A render must be deterministic (Remotion renders
 * the same frame twice and they have to match), so the jitter is a fixed
 * fraction of the slice here rather than `Math.random()`.
 */
export function turnsTo(index, count, { turns = 5, offset = 0.22 } = {}) {
  const seg = sliceAngle(count);
  return turns * TAU - (index + 0.5 + offset) * seg;
}
