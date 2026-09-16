// Motion helpers shared by every scene.
//
// Two rules the whole reel follows. Things *arrive* on a spring, because a
// spring is what a phone's own UI does and the video is pretending to be one.
// Things *leave* on a linear fade, because an ease-out on the way out reads as
// hesitation at the cut.

import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CROSSFADE } from '../config';

// Snappy, barely overshooting — copied in feel from the app's own tab bar.
export const SPRING = { damping: 18, stiffness: 190, mass: 0.7 };
// For anything large (a phone, a wheel): heavier, so size reads as weight.
export const SPRING_HEAVY = { damping: 22, stiffness: 120, mass: 1.1 };

/** 0 → 1 as an element springs in, `delay` frames after the scene starts. */
export const useEnter = (delay = 0, config = SPRING) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame, fps, delay, config });
};

/**
 * The fade that top-and-tails every scene.
 *
 * Neighbouring scenes overlap by `CROSSFADE` frames (see `AppReel`), so these
 * two ramps are the two halves of one dissolve: the outgoing scene is still on
 * screen while the incoming one comes up. Default them to anything longer than
 * the overlap and the cut goes through bare background again.
 */
export const useSceneFade = (duration, { inFrames = CROSSFADE, outFrames = CROSSFADE } = {}) => {
  const frame = useCurrentFrame();
  return interpolate(
    frame,
    [0, inFrames, duration - outFrames, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
};

/** Rise-and-fade-in, the default entrance for a line of text. */
export const fadeUp = (progress, distance = 44) => ({
  opacity: interpolate(progress, [0, 1], [0, 1], { extrapolateRight: 'clamp' }),
  transform: `translateY(${interpolate(progress, [0, 1], [distance, 0])}px)`
});

/** Scale-and-fade-in, the default entrance for a card or a photo. */
export const popIn = (progress, from = 0.86) => ({
  opacity: interpolate(progress, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }),
  transform: `scale(${interpolate(progress, [0, 1], [from, 1])})`
});

/**
 * A number counting up. Eased rather than linear so it decelerates into its
 * final value — a linear counter stops dead and looks like a cut.
 */
export const useCountUp = (to, { delay = 0, duration = 34, from = 0 } = {}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic)
  });
  return from + (to - from) * t;
};

/** A single pulse at `at`, for a badge popping or a button being pressed. */
export const usePulse = (at, { amount = 0.18, length = 16 } = {}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame > at + length) return 1;
  const t = (frame - at) / length;
  return 1 + amount * Math.sin(t * Math.PI);
};

/** Cheap 2-decimal money, so $1234.5 never renders as "$1234.5". */
export const money = value =>
  `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export { interpolate, spring, Easing };
