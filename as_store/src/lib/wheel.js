// Geometry for the Daily Spin wheel, kept apart from the components that draw
// it so the maths can be read (and fixed) in one place. The mobile app carries
// the same file — the two wheels must agree on where a slice sits, or the
// admin's preview would stop matching what the customer sees.
//
// Convention: slice 0 starts at 12 o'clock and they run clockwise, so the
// pointer at the top of the wheel is over slice 0 at rest.

export const TAU = Math.PI * 2

// Radians per slice.
export const sliceAngle = (count) => (count > 0 ? TAU / count : TAU)

// Where slice `i` begins, measured from 12 o'clock, clockwise.
export const sliceStart = (i, count) => i * sliceAngle(count) - Math.PI / 2

// SVG path for one slice of a `count`-slice wheel, centred at (cx, cy).
// A single-slice wheel would degenerate to a zero-length arc, so it draws as a
// full circle instead.
export function slicePath(i, count, cx, cy, r) {
  if (count <= 1) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
  const a0 = sliceStart(i, count)
  const a1 = a0 + sliceAngle(count)
  const x0 = cx + r * Math.cos(a0)
  const y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  const largeArc = sliceAngle(count) > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} Z`
}

// Degrees to rotate a label so it reads outward along its slice's centre line.
export const labelAngle = (i, count) =>
  ((sliceStart(i, count) + sliceAngle(count) / 2) * 180) / Math.PI

// Black or white text, whichever stays legible on `hex`. Uses the sRGB relative
// luminance from WCAG rather than a naive average, so mid greens and reds land
// on the right side of the line.
export function readableOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const channel = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const L =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  return L > 0.45 ? '#15181A' : '#ffffff'
}

// How far to turn to bring slice `index` under the pointer, starting from
// `from` radians: whole turns for the show, plus the exact remaining arc.
// The jitter keeps the wheel off dead-centre (which reads as staged) while
// staying well inside the slice.
export function spinTo(from, index, count, rand = Math.random) {
  const seg = sliceAngle(count)
  const jitter = (rand() - 0.5) * seg * 0.6
  // Slice i is centred at (i + 0.5) * seg from 12 o'clock; turning the wheel
  // back by that much puts it under the pointer.
  const target = -((index + 0.5) * seg) + jitter
  const turns = 5 + Math.floor(rand() * 3)
  const delta = ((target - from) % TAU + TAU) % TAU
  return from + turns * TAU + delta
}
