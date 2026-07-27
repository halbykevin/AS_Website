// A collapsible section. Wrap anything in it:
//
//   <Accordion title="Specifications" count={7}>…</Accordion>
//   <Accordion title="Description" defaultExpanded>…</Accordion>
//   <Accordion title="Filters" expanded={open} onChange={setOpen} />   // controlled
//
// The body is shown and hidden with `display: 'none'`, NOT by animating its
// height, and that choice is the whole point of this file.
//
// Animating height means knowing the height, and you cannot animate to 'auto' —
// so the natural size has to be measured with onLayout and fed back in. That
// measurement is a trap: whatever number the first layout pass happens to
// report becomes the height, and once a definite height is applied the content
// sits inside a box that no longer changes size, so onLayout never fires again
// and there is no second chance. A first pass that lands before the children
// contribute anything locks the section at its padding — a header, a sliver of
// empty card, and content you can never reach. That is exactly what this
// component used to do.
//
// `display: 'none'` has no such failure mode. Yoga drops the subtree from
// layout entirely when closed and gives it its full natural height when open,
// every time, with nothing measured in JS and nothing to get stuck at. The
// height change is then animated natively by `LinearTransition`, which measures
// on the UI thread — and if that ever no-ops, the section still opens correctly
// and simply snaps. Correctness does not depend on the animation.
//
// Details that matter and are easy to miss:
//  • Collapsed content is hidden from screen readers and made untappable.
//  • `useReducedMotion` drops the animations for anyone who asked the OS for
//    less motion.
//  • `lazy` leaves heavy content unmounted until the first expand. Without it
//    the children stay mounted while closed, so they keep their own state.

import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
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
  // SAME commit that opens the section, not a frame later.
  const [everOpened, setEverOpened] = useState(!lazy || defaultExpanded);
  if (open && !everOpened) setEverOpened(true);

  // Drives the chevron and the body's fade — opacity and transform only. Both
  // are cheap, non-layout props, so nothing here can affect whether the content
  // is laid out at the right size.
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = reduceMotion ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: DURATION, easing: EASING });
  }, [open, reduceMotion, progress]);

  const toggle = useCallback(() => {
    if (disabled) return;
    const next = !open;
    if (!isControlled) setInternal(next);
    onChange?.(next);
  }, [disabled, open, isControlled, onChange]);

  const bodyStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value * 180}deg` }] }));

  return (
    <Animated.View
      style={[variant === 'card' ? styles.card : styles.plain, style]}
      // Eases the card between its closed and open size. Reanimated measures
      // both natively, so unlike an onLayout round-trip there is no number for
      // this component to hold on to and get wrong.
      layout={reduceMotion ? undefined : LinearTransition.duration(DURATION)}
      testID={testID}
    >
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
            <Text variant="title" numberOfLines={2} style={styles.title}>
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
            <Text variant="caption" muted numberOfLines={2} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {right}
        <Animated.View style={chevronStyle}>
          <Icon name="chevronDown" size={20} color={disabled ? theme.colors.textFaint : theme.colors.textMuted} />
        </Animated.View>
      </Pressable>

      {/* `hidden` sets display:none, which takes the subtree out of layout
          without constraining it. Open, it is an ordinary in-flow view at its
          own full height — the content is never clipped to a remembered
          number. The animated style only touches opacity. */}
      <Animated.View
        style={[bodyStyle, open ? null : styles.hidden]}
        pointerEvents={open ? 'auto' : 'none'}
        // display:none already removes it, but a closed section must not be
        // reachable by VoiceOver/TalkBack on any platform.
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      >
        <View style={[styles.content, contentStyle]}>{everOpened ? children : null}</View>
      </Animated.View>
    </Animated.View>
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
  // Shrinks so a long title wraps instead of shoving the count pill and the
  // chevron off the edge of a narrow screen.
  title: { flexShrink: 1 },
  subtitle: { marginTop: 2 },
  count: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: t.radii.pill,
    backgroundColor: t.colors.surfaceAlt,
    alignItems: 'center',
    // Never squeezed by a long title — it is two or three characters wide.
    flexShrink: 0
  },

  hidden: { display: 'none' },
  content: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.xs, paddingBottom: t.spacing.lg }
});
