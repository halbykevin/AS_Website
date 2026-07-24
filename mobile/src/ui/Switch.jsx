// Themed on/off toggle — the RN port of the web store's pill switch (AS red when
// on). A tiny spring animates the knob. Use for boolean filters / settings.

import { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import { useTheme } from '@/src/theme';

export default function Switch({ value, onValueChange, disabled = false }) {
  const theme = useTheme();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, bounciness: 6, speed: 14 }).start();
  }, [value, anim]);

  const trackColor = anim.interpolate({ inputRange: [0, 1], outputRange: [theme.alpha(theme.colors.text, 0.2), theme.colors.primary] });
  const knobX = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 22] });

  return (
    <Pressable onPress={() => !disabled && onValueChange?.(!value)} accessibilityRole="switch" accessibilityState={{ checked: value, disabled }} hitSlop={theme.layout.hitSlop} style={{ opacity: disabled ? 0.5 : 1 }}>
      <Animated.View style={{ width: 46, height: 26, borderRadius: 13, backgroundColor: trackColor, justifyContent: 'center' }}>
        <Animated.View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: theme.colors.white,
            transform: [{ translateX: knobX }],
            ...theme.shadows.card
          }}
        />
      </Animated.View>
    </Pressable>
  );
}
