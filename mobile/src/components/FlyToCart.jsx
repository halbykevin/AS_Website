// Add-to-Bag flight — the product photo leaps out of the card and lands on the
// bag icon, so tapping a small pill in a grid of forty tiles has a visible
// consequence and the badge that just changed is the thing you were looking at.
//
// Three parts that never reference each other directly:
//
//   FlyToCartProvider  mounted once, above every screen (AppProviders). The
//                      travelling image *has* to live there: it starts inside a
//                      scrolling list and ends on the app's chrome, and nothing
//                      rendered inside either one can cross that boundary.
//
//   useCartTarget()    the bag icon registers itself as the landing spot.
//                      Registrations are a stack and the last one wins, because
//                      a screen pushed over the tabs — the product page, where
//                      the tab bar is covered — has its own bag button in the
//                      header and must claim the landing spot while it is up.
//                      Unmounting hands it back to whatever was underneath.
//
//   useFlyToCart()     an Add button hands over the photo's ref and the image
//                      url; both ends are measured here, in window coordinates,
//                      so the flight is computed from where things actually are
//                      rather than from where a layout says they should be.
//
// The flight is decoration and nothing else: the item is in the cart before the
// first frame runs, so navigating away mid-flight can never lose it. Reduced
// motion skips it entirely — there is nothing to fall back to, because the real
// work already happened.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/src/theme';
import RemoteImage from './RemoteImage';

const Ctx = createContext(null);

const DURATION = 620;
// The travelling thumbnail: big enough to read as the product, small enough not
// to look like a modal taking off.
const MIN_SIZE = 56;
const MAX_SIZE = 120;

export function FlyToCartProvider({ children }) {
  // A stack of { id, ref }. Mutable rather than state: registering must not
  // re-render the whole app, and nothing reads it during render.
  const targets = useRef([]);
  const [flight, setFlight] = useState(null);
  const reduceMotion = useReducedMotion();

  const registerTarget = useCallback((id, ref) => {
    targets.current = [...targets.current.filter((t) => t.id !== id), { id, ref }];
    return () => {
      targets.current = targets.current.filter((t) => t.id !== id);
    };
  }, []);

  // `source` is a ref to the view the image should appear to leave — the photo
  // in the tile, or the gallery on a product page.
  const flyToCart = useCallback(
    ({ uri, source }) => {
      if (reduceMotion || !uri) return;
      const from = source?.current;
      const to = targets.current[targets.current.length - 1]?.ref?.current;
      if (!from?.measureInWindow || !to?.measureInWindow) return;

      from.measureInWindow((x, y, width, height) => {
        // A view that has not been laid out (or was recycled out of a list
        // between the tap and the callback) measures as zero — there is no
        // sensible place to start from, so there is no flight.
        if (!width || !height) return;
        to.measureInWindow((tx, ty, tw, th) => {
          if (!tw && !th) return;
          setFlight({
            key: `${Date.now()}-${Math.random()}`,
            uri,
            from: { x, y, width, height },
            to: { x: tx + tw / 2, y: ty + th / 2 }
          });
        });
      });
    },
    [reduceMotion]
  );

  const value = useMemo(() => ({ registerTarget, flyToCart }), [registerTarget, flyToCart]);

  // Clear by key: a second tap replaces the flight, and the one it replaced must
  // not then wipe out its successor when it finishes.
  const clear = useCallback((key) => setFlight((f) => (f?.key === key ? null : f)), []);

  return (
    <Ctx.Provider value={value}>
      {children}
      {flight ? <Flight key={flight.key} flight={flight} onDone={clear} /> : null}
    </Ctx.Provider>
  );
}

// The bag icon calls this and puts the returned ref on the view a flight should
// land on. `name` is only for readability — each call gets its own identity, so
// two screens with the same bag button stack instead of overwriting each other,
// and the one underneath is still registered when the top one pops.
let targetSeq = 0;
export function useCartTarget(name = 'cart') {
  const ctx = useContext(Ctx);
  const ref = useRef(null);
  const id = useRef(null);
  if (id.current === null) id.current = `${name}#${++targetSeq}`;
  useEffect(() => ctx?.registerTarget?.(id.current, ref), [ctx]);
  return ref;
}

// Returns a no-op when the provider is absent, so a screen rendered outside it
// (a test, a storybook) still adds to the cart instead of throwing.
export function useFlyToCart() {
  return useContext(Ctx)?.flyToCart ?? noop;
}

const noop = () => {};

function Flight({ flight, onDone }) {
  const theme = useTheme();
  const progress = useSharedValue(0);
  const { from, to, uri, key } = flight;

  // Geometry is fixed for the life of one flight, so it is computed once and
  // captured by the worklet rather than recomputed per frame.
  const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.min(from.width, from.height)));
  const x0 = from.x + from.width / 2;
  const y0 = from.y + from.height / 2;
  // A quadratic bezier with the control point lifted above both ends: the image
  // arcs up and over instead of sliding along a ruler. The lift scales with the
  // distance so a tile near the tab bar doesn't loop absurdly.
  const cx = (x0 + to.x) / 2;
  const cy = Math.min(y0, to.y) - Math.max(70, Math.abs(to.y - y0) * 0.4);

  useEffect(() => {
    progress.value = withTiming(1, { duration: DURATION, easing: Easing.bezier(0.3, 0.1, 0.2, 1) }, () => {
      runOnJS(onDone)(key);
    });
    // Runs once per flight — the component is keyed, so a new flight is a new
    // component rather than a prop change.
  }, [progress, onDone, key]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * to.x;
    const y = u * u * y0 + 2 * u * t * cy + t * t * to.y;
    return {
      // Translate first, then scale: the scale is about the view's own centre,
      // which is what keeps it aimed at the icon the whole way down.
      transform: [{ translateX: x - size / 2 }, { translateY: y - size / 2 }, { scale: 1 - 0.78 * t }],
      // Holds full opacity almost all the way, then vanishes into the icon
      // rather than fading out somewhere over the middle of the screen.
      opacity: t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2)
    };
  });

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="none">
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            width: size,
            height: size,
            borderRadius: theme.radii.lg,
            // No shadow: iOS will not draw one through `overflow: hidden`, and
            // clipping the photo to the rounded corners matters more here.
            overflow: 'hidden',
            backgroundColor: theme.colors.productMedia
          },
          style
        ]}
      >
        <RemoteImage uri={uri} style={{ width: '100%', height: '100%' }} contentFit="contain" transition={0} fallbackIcon="box" />
      </Animated.View>
    </View>
  );
}
