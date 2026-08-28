// The Daily Spin wheel.
//
// The animation is a reveal, never a decision: the parent calls `spinTo(index)`
// only after the server has already told us which slice was drawn, and the
// final rotation is derived from that index. There is no code path where the
// wheel picks a winner, so what the customer watches can never disagree with
// what they were awarded.

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/src/theme';
import { slicePath, labelAngle, readableOn, spinTo, TAU } from '@/src/lib/wheel';

const VB = 300; // viewBox units — the wheel is drawn once and scaled to fit
const C = VB / 2;
const R = C - 10;
const SPIN_MS = 4600;

const AnimatedView = Animated.View;

function SpinWheel({ slices = [], size = 300, onSettled }, ref) {
  const theme = useTheme();
  const rotation = useRef(new Animated.Value(0)).current;
  // The plain number behind the Animated.Value: each spin starts where the last
  // one stopped, so the wheel never snaps back between rounds.
  const angle = useRef(0);
  const [spinning, setSpinning] = useState(false);

  const count = slices.length;

  const run = useCallback(
    index => {
      if (spinning || count === 0) return;
      const target = spinTo(angle.current, Math.max(0, index), count);
      angle.current = target;
      setSpinning(true);
      Animated.timing(rotation, {
        toValue: target,
        duration: SPIN_MS,
        // A long, decelerating glide — fast launch, slow crawl into the slice.
        easing: Easing.bezier(0.15, 0.72, 0.2, 1),
        useNativeDriver: true
      }).start(({ finished }) => {
        setSpinning(false);
        if (finished) onSettled?.(index);
      });
    },
    [count, onSettled, rotation, spinning]
  );

  useImperativeHandle(ref, () => ({ spinTo: run, spinning }), [run, spinning]);

  // Interpolating radians → degrees keeps the maths in one unit (wheel.js) and
  // hands React Native the "Ndeg" strings it wants.
  const spin = useMemo(
    () =>
      rotation.interpolate({
        inputRange: [0, TAU],
        outputRange: ['0deg', '360deg']
      }),
    [rotation]
  );

  const fontSize = count > 10 ? 11 : count > 7 ? 13 : 15;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <AnimatedView style={{ width: size, height: size, transform: [{ rotate: spin }] }}>
        <Svg viewBox={`0 0 ${VB} ${VB}`} width={size} height={size}>
          {slices.map((s, i) => (
            <Path
              key={s.id ?? i}
              d={slicePath(i, count, C, C, R)}
              fill={s.color || theme.colors.primary}
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          ))}
          {slices.map((s, i) => (
            <G key={`label-${s.id ?? i}`} rotation={labelAngle(i, count)} origin={`${C}, ${C}`}>
              <SvgText
                x={C + R * 0.58}
                y={C}
                fill={readableOn(s.color)}
                fontSize={fontSize}
                fontWeight="800"
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {String(s.label || '').slice(0, 14)}
              </SvgText>
            </G>
          ))}
          {/* Hub */}
          <Circle cx={C} cy={C} r={26} fill="#FFFFFF" stroke={theme.colors.inverse} strokeWidth={3} />
          <Circle cx={C} cy={C} r={9} fill={theme.colors.primary} />
        </Svg>
      </AnimatedView>

      {/* The pointer sits outside the rotating view, fixed at 12 o'clock. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -2,
          width: 0,
          height: 0,
          borderLeftWidth: 13,
          borderRightWidth: 13,
          borderTopWidth: 24,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: theme.colors.inverse
        }}
      />
    </View>
  );
}

export default forwardRef(SpinWheel);
