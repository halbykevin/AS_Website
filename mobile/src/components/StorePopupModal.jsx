// Promotions / offers / announcements popup for the app — the native twin of
// the storefront's <StorePopup>. Same CMS record drives both, so a single save
// in /admin/popup updates the website and the app together.
//
// Presented as a bottom sheet (the platform-native shape for a promo on a
// phone) rather than a centred web-style dialog: spring-in from the bottom,
// dimmed scrim, swipe/tap-outside to dismiss, hardware-back handled.
//
// CMS-controlled: enabled, showOnApp, schedule (gated server-side), copy,
// image, CTA, layout (card | banner | text), theme (light | dark) and accent.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, Easing, Linking, Modal, Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useContent } from '@/src/content/ContentProvider';
import { storage, KEYS } from '@/src/lib/storage';
import { useTheme } from '@/src/theme';
import Text from '@/src/ui/Text';
import Icon from '@/src/ui/Icon';
import Button from '@/src/ui/Button';

const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors StorePopup's web logic: 'once' per saved version, 'daily' re-shows
// after 24h, 'always' every launch.
function shouldShow(popup, seenRaw) {
  let seen = null;
  try {
    seen = seenRaw ? JSON.parse(seenRaw) : null;
  } catch {
    seen = null;
  }
  if (!seen || seen.v !== popup.version) return true;
  if (popup.frequency === 'always') return true;
  if (popup.frequency === 'daily') return Date.now() - (seen.t || 0) >= DAY_MS;
  return false;
}

// Only follow links we understand: an in-app route, or an external http(s) URL
// handed to the OS browser. Anything else is ignored rather than trusted.
const IN_APP = [
  /^\/$/,
  /^\/shop(\?.*)?$/,
  /^\/search(\?.*)?$/,
  /^\/category\/[^/]+$/,
  /^\/product\/[^/]+$/,
  /^\/orders(\/\d+)?$/,
  /^\/events(\/[^/]+)?$/,
  /^\/what-we-do(\/[^/]+)?$/,
  /^\/account(\/.*)?$/,
  /^\/predictor$/,
  /^\/company$/,
  /^\/notifications$/
];

function openLink(link) {
  const href = String(link || '').trim();
  if (!href) return;
  if (/^https?:\/\//i.test(href)) {
    Linking.openURL(href).catch(() => {});
    return;
  }
  if (href.startsWith('/') && IN_APP.some(re => re.test(href))) router.push(href);
}

export default function StorePopupModal() {
  const { popup } = useContent();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const shown = useRef(false);

  const slide = useRef(new Animated.Value(1)).current; // 1 = offscreen, 0 = resting
  const fade = useRef(new Animated.Value(0)).current;

  const eligible = Boolean(
    popup && popup.enabled && popup.showOnApp && (popup.title || popup.body || popup.image)
  );

  // Reveal after the configured delay. The app always uses the timer — "scroll"
  // is a website-only trigger, so treat it as an immediate-ish reveal here.
  useEffect(() => {
    if (!eligible || shown.current) return;
    let timer;
    let cancelled = false;
    (async () => {
      const seen = await storage.get(KEYS.popupSeen);
      if (cancelled || !shouldShow(popup, seen)) return;
      const delay = popup.trigger === 'scroll' ? 1 : Math.max(0, popup.delaySeconds ?? 2);
      timer = setTimeout(() => {
        if (cancelled) return;
        shown.current = true;
        setOpen(true);
      }, delay * 1000);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Keyed on the content version, not the popup object: a pull-to-refresh
    // hands back a new object with identical content and must not re-arm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, popup?.version]);

  // Animate in once mounted.
  useEffect(() => {
    if (!open) return;
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, damping: 22, stiffness: 220, mass: 0.9, useNativeDriver: true })
    ]).start();
  }, [open, fade, slide]);

  const close = useCallback(
    (then) => {
      storage.set(KEYS.popupSeen, JSON.stringify({ v: popup?.version, t: Date.now() })).catch(() => {});
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(slide, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ]).start(() => {
        setOpen(false);
        then?.();
      });
    },
    [fade, slide, popup?.version]
  );

  // Android hardware back closes the sheet instead of leaving the screen.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [open, close]);

  if (!open || !popup) return null;

  const { layout = 'card', theme: mode = 'light', accentColor = theme.colors.primary } = popup;
  const dark = mode === 'dark';
  const banner = layout === 'banner' && Boolean(popup.image);
  const onDim = banner || dark;

  const surface = onDim ? theme.colors.inverse : theme.colors.surface;
  const titleColor = onDim ? theme.colors.textOnInverse : theme.colors.text;
  const bodyColor = onDim ? theme.colors.textOnInverseMuted : theme.colors.textMuted;

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Dimensions.get('window').height]
  });

  const cta = popup.link ? (
    <Button
      label={popup.linkLabel || 'Learn more'}
      size="lg"
      fullWidth
      onPress={() => close(() => openLink(popup.link))}
      style={{ backgroundColor: accentColor }}
    />
  ) : null;

  const eyebrow = popup.eyebrow ? (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: theme.radii.pill,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 5,
        backgroundColor: onDim ? accentColor : `${accentColor}1A`
      }}
    >
      <Text variant="overline" weight="bold" color={onDim ? theme.colors.textOnInverse : accentColor}>
        {popup.eyebrow.toUpperCase()}
      </Text>
    </View>
  ) : null;

  const copy = (
    <View style={{ gap: theme.spacing.sm }}>
      {eyebrow}
      {popup.title ? (
        <Text variant="h2" color={titleColor}>
          {popup.title}
        </Text>
      ) : null}
      {popup.body ? (
        <Text variant="body" color={bodyColor}>
          {popup.body}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={() => close()}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={{ ...StyleSheetAbsoluteFill, opacity: fade, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => close()}
            accessibilityLabel="Close announcement"
            accessibilityRole="button"
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          accessibilityRole={Platform.OS === 'ios' ? 'none' : undefined}
          style={{
            transform: [{ translateY }],
            backgroundColor: surface,
            borderTopLeftRadius: theme.radii['3xl'],
            borderTopRightRadius: theme.radii['3xl'],
            overflow: 'hidden',
            paddingBottom: insets.bottom + theme.spacing.lg
          }}
        >
          {/* Close affordance — legible over artwork or plain surface alike. */}
          <Pressable
            onPress={() => close()}
            hitSlop={theme.layout.hitSlop}
            accessibilityLabel="Close"
            accessibilityRole="button"
            style={{
              position: 'absolute',
              right: theme.spacing.md,
              top: theme.spacing.md,
              zIndex: 20,
              height: 34,
              width: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.45)'
            }}
          >
            <Icon name="close" size={18} color={theme.colors.white} />
          </Pressable>

          {banner ? (
            <View style={{ minHeight: 380, justifyContent: 'flex-end' }}>
              <Image
                source={{ uri: popup.image }}
                style={StyleSheetAbsoluteFill}
                contentFit="cover"
                transition={200}
              />
              {/* Scrim so copy stays readable over any photo. */}
              <View style={{ ...StyleSheetAbsoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' }} />
              <View style={{ padding: theme.spacing.xl, gap: theme.spacing.lg }}>
                {copy}
                {cta}
              </View>
            </View>
          ) : (
            <>
              {layout === 'card' && popup.image ? (
                <Image
                  source={{ uri: popup.image }}
                  style={{ width: '100%', aspectRatio: 16 / 10 }}
                  contentFit="cover"
                  transition={200}
                />
              ) : null}
              {layout === 'text' ? <View style={{ height: 6, backgroundColor: accentColor }} /> : null}
              <View style={{ padding: theme.spacing.xl, gap: theme.spacing.lg }}>
                {copy}
                {cta}
              </View>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// Inlined rather than importing StyleSheet just for absoluteFillObject.
const StyleSheetAbsoluteFill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
