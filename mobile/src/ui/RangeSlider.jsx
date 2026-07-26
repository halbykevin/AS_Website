import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useThemedStyles } from '@/src/theme';
import Text from './Text';

const THUMB = 26;
// A thumb is CENTRED on its end of the rail, so half of it hangs past the rail's
// extremes. Reserving that overhang as padding keeps the thumbs — and their
// touch targets — inside the control instead of spilling toward the screen
// edges, where Android's back-swipe gesture swallows the drag before RN sees it.
// It also lines the thumb's outer edge up with the labels above it.
const EDGE = THUMB / 2;
// Tall but narrow: easy to grab vertically without widening the target back into
// the edge-gesture zone we just moved it out of.
const THUMB_HIT_SLOP = { top: 14, bottom: 14, left: 6, right: 6 };

const money = n => `$${Number(n || 0).toLocaleString()}`;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

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

  const fracToValue = useCallback(
    frac => {
      const raw = min + frac * span;
      return clamp(Math.round(raw / step) * step, min, max);
    },
    [min, max, span, step]
  );

  const report = useCallback(
    (loF, hiF) => {
      const lo = fracToValue(loF);
      const hi = fracToValue(hiF);
      setLabels({ lo, hi });
      onChange?.(lo, hi);
    },
    [fracToValue, onChange]
  );
  const commit = useCallback((loF, hiF) => onCommit?.(fracToValue(loF), fracToValue(hiF)), [fracToValue, onCommit]);

  const onLayout = e => {
    const width = e.nativeEvent.layout.width;
    w.value = width;
    setTrackW(width);
  };

  const makePan = (frac, start, isLow) =>
    Gesture.Pan()
      .activeOffsetX([-6, 6])
      .failOffsetY([-12, 12])
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
      });

  const loPan = makePan(loFrac, loStart, true);
  const hiPan = makePan(hiFrac, hiStart, false);

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
                <Animated.View style={[styles.thumb, loStyle]} hitSlop={THUMB_HIT_SLOP} accessibilityRole="adjustable" accessibilityLabel="Minimum price" />
              </GestureDetector>
              <GestureDetector gesture={hiPan}>
                <Animated.View style={[styles.thumb, hiStyle]} hitSlop={THUMB_HIT_SLOP} accessibilityRole="adjustable" accessibilityLabel="Maximum price" />
              </GestureDetector>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const makeStyles = t => ({
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: t.spacing.sm },
  trackWrap: { paddingHorizontal: EDGE },
  track: { height: THUMB, justifyContent: 'center' },
  rail: { position: 'absolute', left: 0, right: 0, height: 5, borderRadius: 3, backgroundColor: t.alpha(t.colors.text, 0.12) },
  fill: { position: 'absolute', height: 5, borderRadius: 3, backgroundColor: t.colors.primary },
  thumb: {
    position: 'absolute',
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
