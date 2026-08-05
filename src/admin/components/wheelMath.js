// Pure geometry + randomness behind the lucky-draw wheel, kept out of the
// component so the one property that really matters can be verified in
// isolation: the wheel must always settle with the entry it picked sitting
// under the pointer. The animation is the reveal, never the decision.

export const TAU = Math.PI * 2
export const POINTER = -Math.PI / 2 // the pointer sits at 12 o'clock

export const normalize = (a) => ((a % TAU) + TAU) % TAU

// Deceleration curve: fast launch, long glide, a whisper of a crawl at the end.
export const easeOut = (t) => 1 - Math.pow(1 - t, 4)

// Unbiased random index. `getRandomValues() % n` is skewed for any n that
// doesn't divide 2^32, so oversized values are rejected and redrawn instead.
export function randomIndex(n) {
  if (n <= 1) return 0
  const crypto = globalThis.crypto
  if (!crypto?.getRandomValues) return Math.floor(Math.random() * n)
  const limit = Math.floor(0xffffffff / n) * n
  const buf = new Uint32Array(1)
  for (let i = 0; i < 64; i++) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % n
  }
  return buf[0] % n
}

// Which entry currently sits under the pointer, for the live readout + ticking.
export function indexAtPointer(rotation, count) {
  if (count <= 0) return 0
  const seg = TAU / count
  return Math.floor(normalize(POINTER - rotation) / seg) % count
}

// How far to turn from `from` to land `winnerIndex` under the pointer: 6–8 whole
// turns plus the remaining arc. The jitter stops the wheel dead-centre-of-segment
// every time (which looks staged) while staying safely inside that segment.
export function spinDelta(from, winnerIndex, count, rand = Math.random) {
  const seg = TAU / count
  const jitter = (rand() - 0.5) * seg * 0.62
  const target = POINTER - (winnerIndex * seg + seg / 2) + jitter
  const turns = 6 + Math.floor(rand() * 3)
  return turns * TAU + normalize(target - from)
}
