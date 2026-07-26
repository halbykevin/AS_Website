import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useThemedStyles } from '@/src/theme';
import Text from './Text';

const THUMB = 26;
const RAIL = 5;
// A real 44dp touch strip. The thumb still *looks* like 26dp, but a gesture's
// hitSlop is clipped to its parent's bounds on Android, so the parent has to be
// as tall as the target we want.
const TRACK_H = 44;
// A thumb is CENTRED on its end of the rail, so half of it hangs past the rail's
// extremes. Reserving that overhang as padding keeps the thumbs — and their
// touch targets — inside the control instead of spilling toward the screen
// edges, where Android's back-swipe gesture swallows the drag before RN sees it.
// It also lines the thumb's outer edge up with the labels above it.
const EDGE = THUMB / 2;
// Tall but narrow: easy to grab vertically without widening the target back into
// the edge-gesture zone we just moved it out of. Goes on the GESTURE, not the
// view — a hitSlop prop on a GestureDetector's child does not widen the handler.
const THUMB_HIT_SLOP = { top: (TRACK_H - THUMB) / 2, bottom: (TRACK_H - THUMB) / 2, left: 6, right: 6 };

const money = n => `$${Number(n || 0).toLocaleString()}`;

// MUST be a worklet. It's called from the pan handler, which runs on the UI
// thread; without the directive Reanimated captures it into the worklet closure
// as a plain function and calling it there throws "Tried to synchronously call
// a non-worklet function on the UI thread" — crashing the app on the first
// pixel of a drag. Marking it a worklet leaves it perfectly callable from JS
// too, which the render path below relies on.
function clamp(v, lo, hi) {
  'worklet';
  return Math.min(Math.max(v, lo), hi);
}

export default function RangeSlider({ bounds, low, high, step = 1, onChange, onCommit }) {
  const styles = useThemedStyles(makeStyles);
  const { min, max } = bounds;
  const span = Math.max(1, max - min);
  const [trackW, setTrackW] = useState(0);
  const [labels, setLabels] = useState({ lo: low ?? min, hi: high ?? max });
  const loFrac = useSharedValue((clamp(low ?? min, min, max) - min) / span);
  const hiFrac = useSharedValue((clamp(high ?? max, min, max) - min) / span);
  const loStart = useSharedValue(0);
  const hiStart = useSharedValue(0);
  const w = useSharedValue(0);

  // The gestures have to be built exactly once. GestureDetector reconfigures the
  // native handler whenever the gesture object changes, and this component
  // re-renders on every drag frame (the $ labels are state) — so building them
  // inline meant reattaching mid-drag, ~60 times a second. Everything volatile
  // is read through this ref instead, which keeps the callbacks below (and
  // therefore the gestures) referentially stable for the component's lifetime.
  const latest = useRef(null);
  latest.current = { min, max, span, step, onChange, onCommit };

  const fracToValue = useCallback(frac => {
    const c = latest.current;
    return clamp(Math.round((c.min + frac * c.span) / c.step) * c.step, c.min, c.max);
  }, []);

  const report = useCallback(
    (loF, hiF) => {
      const lo = fracToValue(loF);
      const hi = fracToValue(hiF);
      setLabels({ lo, hi });
      latest.current.onChange?.(lo, hi);
    },
    [fracToValue]
  );

  const commit = useCallback(
    (loF, hiF) => {
      latest.current.onCommit?.(fracToValue(loF), fracToValue(hiF));
    },
    [fracToValue]
  );

  const onLayout = e => {
    const width = e.nativeEvent.layout.width;
    w.value = width;
    setTrackW(width);
  };

  const makePan = useCallback(
    (frac, start, isLow) =>
      Gesture.Pan()
        .activeOffsetX([-6, 6])
        .failOffsetY([-12, 12])
        .hitSlop(THUMB_HIT_SLOP)
        .onBegin(() => {
          'worklet';
          start.value = frac.value;
        })
        .onUpdate(e => {
          'worklet';
          const delta = w.value > 0 ? e.translationX / w.value : 0;
          let next = clamp(start.value + delta, 0, 1);
          if (isLow) next = Math.min(next, hiFrac.value);
          else next = Math.max(next, loFrac.value);
          frac.value = next;
          runOnJS(report)(loFrac.value, hiFrac.value);
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(commit)(loFrac.value, hiFrac.value);
        }),
    [report, commit, loFrac, hiFrac, w]
  );

  const loPan = useMemo(() => makePan(loFrac, loStart, true), [makePan, loFrac, loStart]);
  const hiPan = useMemo(() => makePan(hiFrac, hiStart, false), [makePan, hiFrac, hiStart]);

  const loStyle = useAnimatedStyle(() => ({ transform: [{ translateX: loFrac.value * w.value - THUMB / 2 }] }));
  const hiStyle = useAnimatedStyle(() => ({ transform: [{ translateX: hiFrac.value * w.value - THUMB / 2 }] }));
  const fillStyle = useAnimatedStyle(() => ({ left: loFrac.value * w.value, right: w.value - hiFrac.value * w.value }));

  return (
    <View>
      <View style={styles.labelRow}>
        <Text variant="callout" weight="semibold">
          {money(labels.lo)}
        </Text>
        <Text variant="callout" weight="semibold">
          {money(labels.hi)}
        </Text>
      </View>

      <View style={styles.trackWrap}>
        <View style={styles.track} onLayout={onLayout}>
          <View style={styles.rail} />
          <Animated.View style={[styles.fill, fillStyle]} />
          {trackW > 0 ? (
            <>
              <GestureDetector gesture={loPan}>
                <Animated.View style={[styles.thumb, loStyle]} accessibilityRole="adjustable" accessibilityLabel="Minimum price" />
              </GestureDetector>
              <GestureDetector gesture={hiPan}>
                <Animated.View style={[styles.thumb, hiStyle]} accessibilityRole="adjustable" accessibilityLabel="Maximum price" />
              </GestureDetector>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const makeStyles = t => ({
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: t.spacing.xs },
  trackWrap: { paddingHorizontal: EDGE },
  track: { height: TRACK_H, justifyContent: 'center' },
  // Absolute children get explicit tops rather than relying on the parent's
  // justifyContent, which Yoga applies inconsistently to absolute layout.
  rail: { position: 'absolute', top: (TRACK_H - RAIL) / 2, left: 0, right: 0, height: RAIL, borderRadius: 3, backgroundColor: t.alpha(t.colors.text, 0.12) },
  fill: { position: 'absolute', top: (TRACK_H - RAIL) / 2, height: RAIL, borderRadius: 3, backgroundColor: t.colors.primary },
  thumb: {
    position: 'absolute',
    top: (TRACK_H - THUMB) / 2,
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: t.colors.white,
    borderWidth: 2,
    borderColor: t.colors.primary,
    ...t.shadows.card
  }
});
