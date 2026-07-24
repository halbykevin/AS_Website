// Loading placeholder with a gentle pulse. Used by lists while data fetches.
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useTheme } from '@/src/theme';

export default function Skeleton({ width = '100%', height = 16, radius = 'md', style }) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: theme.radii[radius] ?? theme.radii.md,
          backgroundColor: theme.colors.skeleton,
          opacity
        },
        style
      ]}
    />
  );
}
