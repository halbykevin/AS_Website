// The three panels the AS Company homepage is made of, in the app.
//
// as.com.lb is these three and nothing else — the store, the ticketing hub, and
// what the company does — so the Home tab is the same three, in the same order.
// The one difference is where they go: on the web each panel leaves for another
// domain, and here every one of them stays inside the app. Store opens the Shop
// tab, Events opens the Events tab, What We Do opens the What We Do screen.
// Sending someone to a browser from inside the app that already has the thing
// they tapped would be the app losing to its own website.

import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
// Bundled artwork, not a remote photo — RemoteImage takes a URI and these are
// require()d modules, so they go through expo-image directly.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTheme, useThemedStyles } from '@/src/theme';
import Text from '@/src/ui/Text';
import Icon from '@/src/ui/Icon';
import RemoteImage from '@/src/components/RemoteImage';

const STORE_LOGO = require('../../../assets/as-store-logo-clear.png');
const HUB_LOGO = require('../../../assets/as-ticketing-hub-logo.png');

// How long a slide holds before the next one. Long enough to read a product
// name, short enough that a second one is seen before the thumb moves on.
const SLIDE_MS = 4500;

/**
 * The store slideshow: real products, two or three at a time, no price.
 *
 * Prices are absent on purpose and must stay absent — they move with sales, the
 * catalog sync and "call for price" lines, and the store is the one place they
 * are quoted. A number printed here is a promise this screen would have to keep
 * true. Tapping a card opens that product; tapping the panel opens the Shop tab.
 */
export function StorePanel({ banner }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const products = banner?.products || [];

  // Two on a phone whatever the admin picked: three cards across 360dp leaves
  // about 100dp each, which is a thumbnail with a caption under it, not a
  // product. The website makes the same call at its own narrow breakpoint.
  const perSlide = width < 480 ? Math.min(2, banner?.perSlide || 2) : banner?.perSlide || 2;
  const slides = [];
  for (let i = 0; i < products.length; i += perSlide) slides.push(products.slice(i, i + perSlide));

  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);
  const [boxWidth, setBoxWidth] = useState(0);

  useEffect(() => {
    if (slides.length < 2 || !boxWidth) return undefined;
    const timer = setInterval(() => {
      setIndex(i => {
        const next = (i + 1) % slides.length;
        scrollRef.current?.scrollTo({ x: next * boxWidth, animated: true });
        return next;
      });
    }, SLIDE_MS);
    return () => clearInterval(timer);
  }, [slides.length, boxWidth]);

  return (
    <Panel
      label="AS Store"
      onPress={() => router.push('/shop')}
      cta="Visit store"
      style={{ backgroundColor: theme.colors.surface }}
    >
      {slides.length === 0 ? (
        // No product resolvable — the store API is down, or nothing is picked.
        // The logo is the honest answer and is what the website falls back to.
        <View style={styles.logoWrap}>
          <Image source={STORE_LOGO} style={styles.logo} contentFit="contain" />
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onLayout={e => setBoxWidth(e.nativeEvent.layout.width)}
            onMomentumScrollEnd={e => boxWidth && setIndex(Math.round(e.nativeEvent.contentOffset.x / boxWidth))}
            style={{ flexGrow: 0 }}
          >
            {slides.map((slide, i) => (
              <View key={i} style={[styles.slide, { width: boxWidth || width }]}>
                {slide.map(p => (
                  <Pressable key={p.id} onPress={() => router.push(`/product/${p.slug}`)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
                    <RemoteImage uri={p.image} style={styles.cardImage} contentFit="contain" fallbackIcon="box" />
                    {p.brand ? (
                      <Text variant="overline" color="primary" numberOfLines={1}>
                        {p.brand}
                      </Text>
                    ) : null}
                    <Text variant="caption" numberOfLines={2} style={{ fontWeight: '700' }}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
          {slides.length > 1 ? (
            <View style={styles.dots}>
              {slides.map((_, i) => (
                <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
              ))}
            </View>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/** The ticketing hub: its logo, and nothing else — same as the website's. */
export function EventsPanel() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Panel label="AS Ticketing Hub" onPress={() => router.push('/events')} cta="View events" style={{ backgroundColor: theme.colors.surface }}>
      <View style={styles.logoWrap}>
        <Image source={HUB_LOGO} style={styles.hubLogo} contentFit="contain" />
      </View>
    </Panel>
  );
}

/** What We Do — the company itself, one tap from the same place as the web. */
export function WhatWeDoPanel({ services }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const words = (Array.isArray(services?.items) ? services.items : []).map(i => i?.title).filter(Boolean);

  return (
    <Panel label={services?.heading || 'What We Do'} onPress={() => router.push('/what-we-do')} cta="Explore now" style={{ backgroundColor: theme.colors.primaryWash || '#fbe6e8' }}>
      <View style={styles.whatWeDo}>
        <Text variant="display" style={{ textAlign: 'center' }} numberOfLines={2}>
          {services?.heading || 'What We Do'}
        </Text>
        {words.length > 0 ? (
          <Text variant="overline" color="primary" style={{ textAlign: 'center', marginTop: theme.spacing.sm }} numberOfLines={2}>
            {words.slice(0, 4).join(' · ')}
          </Text>
        ) : null}
      </View>
    </Panel>
  );
}

/**
 * One panel: a tappable card with the same proportions as its two siblings, and
 * the destination said outright underneath rather than left to be guessed. The
 * website does the same — a panel that only *looks* tappable gets tapped less.
 */
function Panel({ label, onPress, cta, style, children }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} — ${cta}`} onPress={onPress} style={({ pressed }) => [styles.panel, style, pressed && { opacity: 0.95 }]}>
        {children}
      </Pressable>
      <Pressable onPress={onPress} style={styles.cta} hitSlop={theme.layout.hitSlop}>
        <Text variant="caption" color="primary" style={{ fontWeight: '800' }}>
          {cta}
        </Text>
        <Icon name="arrowRight" size={14} color={theme.colors.primary} />
      </Pressable>
    </View>
  );
}

const makeStyles = t => ({
  panel: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: t.radii['3xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: t.colors.border,
    justifyContent: 'center',
    ...t.shadows.card
  },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', paddingTop: t.spacing.sm, paddingHorizontal: t.spacing.xs },
  logoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl },
  logo: { width: '62%', height: '62%' },
  hubLogo: { width: '70%', height: '78%' },
  slide: { flexDirection: 'row', gap: t.spacing.md, padding: t.spacing.lg, alignItems: 'stretch' },
  card: { flex: 1, gap: 4, justifyContent: 'flex-start' },
  cardImage: { width: '100%', flex: 1, marginBottom: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: t.spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.colors.border },
  dotOn: { backgroundColor: t.colors.primary, width: 18 },
  whatWeDo: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: t.spacing.xl }
});
