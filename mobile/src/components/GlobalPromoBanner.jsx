import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useContent } from '@/src/content/ContentProvider';
import { useTheme } from '@/src/theme';
import Text from '@/src/ui/Text';

const GlobalPromoContext = createContext(false);
const DEFAULT_PROMISES = ['Free delivery on orders over $100', '12 months warranty', 'Cash on delivery', '100% genuine tech'];

export const useGlobalPromoVisible = () => useContext(GlobalPromoContext);

function phrasesFrom(announcement) {
  const configured = String(announcement?.text || '')
    .split(/\s*(?:[·•|]|\u2726)\s*/)
    .map(value => value.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_PROMISES;
}

// One app-level frame owns the red promise ribbon. Keeping it above the router
// makes it truly global and prevents every screen/header from mounting its own
// animation. The context tells safe-area-aware descendants that the top inset
// has already been consumed here.
export default function GlobalPromoFrame({ children }) {
  const { storeSettings } = useContent();
  const announcement = storeSettings?.announcement;
  // This mirrors the web homepage's always-on VelocityBand. The CMS
  // announcement supplies its copy when present, but disabling the separate
  // announcement notice does not remove the global store-promises ribbon.
  const visible = true;

  return (
    <GlobalPromoContext.Provider value={visible}>
      <View style={{ flex: 1 }}>
        {visible ? <PromoMarquee phrases={phrasesFrom(announcement)} /> : null}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </GlobalPromoContext.Provider>
  );
}

function PromoMarquee({ phrases }) {
  const theme = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const [rowWidth, setRowWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const label = useMemo(() => phrases.map(value => value.toUpperCase()), [phrases]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => mounted && setReduceMotion(value));
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    x.stopAnimation();
    x.setValue(0);
    if (!rowWidth || reduceMotion) return undefined;

    const animation = Animated.loop(
      Animated.timing(x, {
        toValue: -rowWidth,
        duration: Math.max(14000, rowWidth * 28),
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, rowWidth, x]);

  const row = key => (
    <View
      key={key}
      onLayout={key === 'measure' ? event => setRowWidth(Math.ceil(event.nativeEvent.layout.width)) : undefined}
      style={{ flexDirection: 'row', alignItems: 'center' }}
    >
      {label.map((value, index) => (
        <View key={`${key}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg, paddingRight: theme.spacing.lg }}>
          <Text variant="callout" color="textOnPrimary" weight="bold" style={{ letterSpacing: 0.35 }}>
            {value}
          </Text>
          <Text variant="callout" color="textOnPrimary" style={{ opacity: 0.55 }}>
            ✦
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.colors.primary }}>
      <StatusBar style="light" backgroundColor={theme.colors.primary} />
      <View
        accessibilityRole="text"
        accessibilityLabel={phrases.join('. ')}
        style={{ height: 36, overflow: 'hidden', justifyContent: 'center', backgroundColor: theme.colors.primary }}
      >
        {reduceMotion ? (
          <View style={{ paddingHorizontal: theme.layout.screenPadding }}>{row('static')}</View>
        ) : (
          <Animated.View style={{ flexDirection: 'row', width: 'auto', transform: [{ translateX: x }] }}>
            {row('measure')}
            {row('copy')}
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}
