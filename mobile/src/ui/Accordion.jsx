// A collapsible section that animates its own height. Wrap anything in it:
//
//   <Accordion title="Specifications" count={7}>…</Accordion>
//   <Accordion title="Description" defaultExpanded>…</Accordion>
//   <Accordion title="Filters" expanded={open} onChange={setOpen} />   // controlled
//
// How the height animation works, since it is the part that usually goes wrong.
// You cannot animate to 'auto', so the content's natural height has to be
// measured — but a collapsed section is clipped to 0, and content inside a
// zero-height box measures 0. Ask it how tall it is and it says 0, the height
// stays 0, and the section never opens.
//
// So there are two phases. Until the height is known the body is taken OUT of
// flow and made invisible: it lays out at full size (so onLayout reports a real
// number) while occupying no space and being unseen — no flash, no layout
// shift. Once measured, the body returns to normal flow and its height is
// driven 0 -> measured on the UI thread. Because measurement is continuous,
// the section also resizes itself when its content reflows (a font-scale
// change, a late-loading value): onLayout simply fires again with a new number.
//
// Details that matter and are easy to miss:
//  • Collapsed content is hidden from screen readers and made untappable.
//    Clipping is only visual — without this, VoiceOver/TalkBack happily read a
//    "hidden" section and its buttons stay reachable.
//  • `useReducedMotion` snaps instead of animating for anyone who asked the OS
//    for less motion.
//  • The first measurement of an initially-expanded section is applied without
//    animating, so the screen doesn't open with a section sliding down.
//  • `lazy` leaves heavy content unmounted until the first expand.

import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme, useThemedStyles } from '@/src/theme';
import Text from './Text';
import Icon from './Icon';

const DURATION = 220;
const EASING = Easing.bezier(0.32, 0.72, 0, 1); // matches the app's sheet motion

export default function Accordion({
  title,
  subtitle,
  count, // small pill next to the title — e.g. how many rows are inside
  icon, // optional leading icon name
  right, // custom node rendered before the chevron
  expanded, // provide to control it; omit to let it manage itself
  defaultExpanded = false,
  onChange,
  disabled = false,
  lazy = false,
  variant = 'card', // 'card' | 'plain'
  style,
  headerStyle,
  contentStyle,
  children,
  testID
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReducedMotion();

  const isControlled = expanded !== undefined;
  const [internal, setInternal] = useState(defaultExpanded);
  const open = isControlled ? expanded : internal;

  // Mount gate for `lazy`: once opened, stay mounted so reopening is instant.
  // Flipped during render rather than in an effect so the children mount in the
  // SAME commit that opens the section — an effect would run a frame later, and
  // the height animation would start against a measurement taken while the
  // content was still empty, producing a visible pop.
  const [everOpened, setEverOpened] = useState(!lazy || defaultExpanded);
  if (open && !everOpened) setEverOpened(true);

  const progress = useSharedValue(open ? 1 : 0);
  const contentHeight = useSharedValue(0);
  // Also in React state, because it decides which style the body renders with —
  // that is a render-time choice and a shared value can't drive it.
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const measuring = measuredHeight === 0;

  useEffect(() => {
    progress.value = reduceMotion ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: DURATION, easing: EASING });
  }, [open, reduceMotion, progress]);

  const onContentLayout = useCallback(
    e => {
      const h = e.nativeEvent.layout.height;
      if (h <= 0 || Math.abs(h - contentHeight.value) < 0.5) return;
      // Written straight to the shared value as well as to state: the effect
      // that would otherwise sync it runs a frame later, and the body would
      // render its first animated frame against a height of 0.
      contentHeight.value = h;
      setMeasuredHeight(h);
    },
    [contentHeight]
  );

  const toggle = useCallback(() => {
    if (disabled) return;
    const next = !open;
    if (!isControlled) setInternal(next);
    onChange?.(next);
  }, [disabled, open, isControlled, onChange]);

  const bodyStyle = useAnimatedStyle(() => ({
    height: progress.value * contentHeight.value,
    // Fades slightly ahead of the height so the text doesn't appear to be
    // squeezed out of existence.
    opacity: progress.value
  }));

  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value * 180}deg` }] }));

  return (
    <View style={[variant === 'card' ? styles.card : styles.plain, style]} testID={testID}>
      <Pressable
        onPress={toggle}
        disabled={disabled}
        style={({ pressed }) => [styles.header, headerStyle, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled }}
        accessibilityLabel={title}
        accessibilityHint={open ? 'Collapses this section' : 'Expands this section'}
      >
        {icon ? <Icon name={icon} size={20} color={theme.colors.textMuted} /> : null}

        <View style={styles.titleWrap}>
          <View style={styles.titleRow}>
            <Text variant="title" numberOfLines={1} style={styles.title}>
              {title}
            </Text>
            {count != null ? (
              <View style={styles.count}>
                <Text variant="overline" muted>
                  {count}
                </Text>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <Text variant="caption" muted numberOfLines={1} style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {right}
        <Animated.View style={chevronStyle}>
          <Icon name="chevronDown" size={20} color={disabled ? theme.colors.textFaint : theme.colors.textMuted} />
        </Animated.View>
      </Pressable>

      {/* Two phases, because a collapsed section cannot measure itself.

          Until the content's natural height is known the body is taken OUT of
          flow and made invisible: it still lays out at full size, so onLayout
          reports a real number, but it occupies no space and cannot be seen —
          no flash, no layout shift. Once the height is in, the body returns to
          normal flow and is driven by the animation.

          The first version of this clipped the content to height 0 and then
          asked it how tall it was. It answered 0, so the height stayed 0 and
          nothing ever appeared. */}
      <Animated.View
        style={[styles.body, measuring ? styles.measuring : bodyStyle]}
        pointerEvents={open && !measuring ? 'auto' : 'none'}
      >
        <View
          onLayout={onContentLayout}
          // Clipping is visual only — assistive tech would still reach in.
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
          style={[styles.content, contentStyle]}
        >
          {everOpened ? children : null}
        </View>
      </Animated.View>
    </View>
  );
}

const makeStyles = t => ({
  card: {
    borderRadius: t.radii['2xl'],
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    overflow: 'hidden'
  },
  plain: { borderTopWidth: 1, borderTopColor: t.colors.border },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    // Past the 48dp minimum target with room for a two-line title.
    minHeight: 56,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md
  },
  pressed: { backgroundColor: t.colors.surfaceAlt },
  disabled: { opacity: 0.5 },

  titleWrap: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  title: { flexShrink: 1 },
  count: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: t.radii.pill,
    backgroundColor: t.colors.surfaceAlt,
    alignItems: 'center'
  },

  body: { overflow: 'hidden' },
  // Measuring pass: laid out at natural size, out of flow, invisible.
  measuring: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  content: { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg }
});
