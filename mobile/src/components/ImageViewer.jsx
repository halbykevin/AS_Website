// Full-screen photo lightbox. Tap a product photo to open it edge-to-edge, then
// pinch or double-tap to zoom, drag a zoomed photo to pan around it, swipe
// sideways between photos, and swipe down (or hit the close button) to dismiss.
//
// The gesture wiring is the delicate part, so the reasoning is written down:
//
//  • RN's <Modal> mounts in its OWN view hierarchy, which the
//    GestureHandlerRootView in app/_layout.jsx does not reach into. Without a
//    second root inside the modal every gesture here silently does nothing on
//    Android — the most common way a screen like this ships broken.
//  • Zoom state is committed to React only when a gesture ENDS. The gestures
//    that depend on it (`.enabled(...)`) therefore only change identity between
//    gestures; flipping them mid-pinch makes GestureDetector reconfigure the
//    native handler underneath a live touch and cancels it.
//  • Panning a zoomed photo and swipe-to-dismiss are two separate Pan gestures
//    made mutually exclusive with `.enabled()`, rather than one gesture juggling
//    offset thresholds for both jobs.
//  • The pager stops scrolling while a photo is zoomed, so dragging a zoomed
//    photo sideways pans it instead of flicking to the next one.
//  • There is deliberately no tap-to-close: a single tap would have to wait out
//    the double-tap window before firing, which feels broken, and it turns every
//    mis-aimed zoom into an accidental dismissal. Close is the X or a swipe down
//    — the same contract as the iOS Photos viewer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useTheme } from '@/src/theme';
import Text from '@/src/ui/Text';
import Icon from '@/src/ui/Icon';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
// A pinch may overshoot below 1:1 for rubber-band feel; `settle` springs it back.
const RUBBER_MIN = 0.85;
// Far enough that a lazy vertical wobble while looking doesn't close the viewer.
const DISMISS_AT = 130;
const DISMISS_VELOCITY = 900;
const TIMING = { duration: 220 };

function clamp(v, lo, hi) {
  'worklet';
  return Math.min(Math.max(v, lo), hi);
}

export default function ImageViewer({ images = [], index = 0, visible = false, onClose }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const listRef = useRef(null);
  const [active, setActive] = useState(index);
  const [zoomed, setZoomed] = useState(false);
  const backdrop = useSharedValue(1);

  const close = useCallback(() => {
    backdrop.value = 1;
    onClose?.();
  }, [onClose, backdrop]);

  // Reopening must land on the photo that was tapped. The list survives between
  // opens, so `initialScrollIndex` alone would leave it wherever it was closed.
  useEffect(() => {
    if (!visible) return;
    setActive(index);
    setZoomed(false);
    backdrop.value = 1;
    const id = requestAnimationFrame(() => {
      if (index > 0) listRef.current?.scrollToIndex({ index, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [visible, index, backdrop]);

  const onZoomChange = useCallback(v => setZoomed(v), []);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const renderItem = useCallback(
    ({ item, index: i }) => (
      <ZoomablePage uri={item} width={width} height={height} active={i === active} backdrop={backdrop} onZoomChange={onZoomChange} onDismiss={close} />
    ),
    [width, height, active, backdrop, onZoomChange, close]
  );

  const getItemLayout = useCallback((_, i) => ({ length: width, offset: width * i, index: i }), [width]);

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={close} supportedOrientations={['portrait', 'landscape']}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[{ flex: 1, backgroundColor: '#000' }, backdropStyle]}>
          <FlatList
            ref={listRef}
            data={images}
            keyExtractor={(item, i) => `${item || 'blank'}-${i}`}
            renderItem={renderItem}
            horizontal
            pagingEnabled
            // Frozen while zoomed, or a sideways pan would flick to the next photo.
            scrollEnabled={!zoomed}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index}
            getItemLayout={getItemLayout}
            onScrollToIndexFailed={() => {}}
            onMomentumScrollEnd={e => setActive(Math.round(e.nativeEvent.contentOffset.x / width))}
            windowSize={3}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
          />

          <View style={[styles.chrome, { paddingTop: insets.top + theme.spacing.sm, paddingHorizontal: theme.layout.screenPadding }]} pointerEvents="box-none">
            {images.length > 1 ? (
              <View style={styles.counter}>
                <Text variant="callout" weight="semibold" style={{ color: '#fff' }}>
                  {active + 1} / {images.length}
                </Text>
              </View>
            ) : (
              <View />
            )}
            <Pressable onPress={close} hitSlop={theme.layout.hitSlop} style={styles.close} accessibilityRole="button" accessibilityLabel="Close image viewer">
              <Icon name="close" size={22} color="#fff" />
            </Pressable>
          </View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ZoomablePage({ uri, width, height, active, backdrop, onZoomChange, onDismiss }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  // Mirrors `panEnabled` on the UI thread, so worklets can read the zoom state
  // without a round trip to JS.
  const isZoomed = useSharedValue(false);
  const [panEnabled, setPanEnabled] = useState(false);

  const commitZoom = useCallback(
    v => {
      setPanEnabled(v);
      onZoomChange?.(v);
    },
    [onZoomChange]
  );

  // Paging away from a photo drops its zoom, so returning to it is predictable.
  // Only the local control is reset — the viewer's own zoom flag is already
  // false, since you cannot page while zoomed.
  useEffect(() => {
    if (active) return;
    scale.value = withTiming(MIN_SCALE, TIMING);
    tx.value = withTiming(0, TIMING);
    ty.value = withTiming(0, TIMING);
    savedScale.value = MIN_SCALE;
    savedTx.value = 0;
    savedTy.value = 0;
    isZoomed.value = false;
    setPanEnabled(false);
  }, [active, scale, tx, ty, savedScale, savedTx, savedTy, isZoomed]);

  const gesture = useMemo(() => {
    const setZoomedUI = next => {
      'worklet';
      if (isZoomed.value === next) return;
      isZoomed.value = next;
      runOnJS(commitZoom)(next);
    };

    // At scale s the photo's box overhangs the viewport by (s-1)/2 per axis,
    // which is exactly how far it is allowed to travel before showing a gutter.
    const settle = () => {
      'worklet';
      if (scale.value <= MIN_SCALE) {
        scale.value = withTiming(MIN_SCALE, TIMING);
        tx.value = withTiming(0, TIMING);
        ty.value = withTiming(0, TIMING);
        savedScale.value = MIN_SCALE;
        savedTx.value = 0;
        savedTy.value = 0;
        setZoomedUI(false);
        return;
      }
      const lx = (width * (scale.value - 1)) / 2;
      const ly = (height * (scale.value - 1)) / 2;
      const nx = clamp(tx.value, -lx, lx);
      const ny = clamp(ty.value, -ly, ly);
      if (nx !== tx.value) tx.value = withTiming(nx, TIMING);
      if (ny !== ty.value) ty.value = withTiming(ny, TIMING);
      savedScale.value = scale.value;
      savedTx.value = nx;
      savedTy.value = ny;
      setZoomedUI(true);
    };

    const pinch = Gesture.Pinch()
      .onStart(e => {
        'worklet';
        savedScale.value = scale.value;
        savedTx.value = tx.value;
        savedTy.value = ty.value;
        // Centre-origin coordinates: the transform scales about the view's
        // centre, so the focal maths has to speak the same language.
        focalX.value = e.focalX - width / 2;
        focalY.value = e.focalY - height / 2;
      })
      .onUpdate(e => {
        'worklet';
        const next = clamp(savedScale.value * e.scale, RUBBER_MIN, MAX_SCALE);
        const ratio = next / savedScale.value;
        scale.value = next;
        // Keep whatever is under the fingers under the fingers:
        //   t1 = f - (s1/s0)(f - t0)
        tx.value = focalX.value - ratio * (focalX.value - savedTx.value);
        ty.value = focalY.value - ratio * (focalY.value - savedTy.value);
      })
      .onEnd(() => {
        'worklet';
        settle();
      });

    const panZoom = Gesture.Pan()
      .enabled(panEnabled)
      .onStart(() => {
        'worklet';
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      })
      .onUpdate(e => {
        'worklet';
        tx.value = savedTx.value + e.translationX;
        ty.value = savedTy.value + e.translationY;
      })
      .onEnd(() => {
        'worklet';
        settle();
      });

    const panDismiss = Gesture.Pan()
      .enabled(!panEnabled)
      // Vertical only — horizontal drags must fall through to the pager.
      .activeOffsetY([-18, 18])
      .failOffsetX([-24, 24])
      .onUpdate(e => {
        'worklet';
        ty.value = e.translationY;
        // Fade the black out as the photo travels, so the dismissal reads as
        // "putting it back" rather than a hard cut.
        backdrop.value = clamp(1 - Math.abs(e.translationY) / (DISMISS_AT * 2.4), 0.3, 1);
      })
      .onEnd(e => {
        'worklet';
        if (Math.abs(e.translationY) > DISMISS_AT || Math.abs(e.velocityY) > DISMISS_VELOCITY) {
          runOnJS(onDismiss)();
          return;
        }
        ty.value = withTiming(0, TIMING);
        backdrop.value = withTiming(1, TIMING);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(260)
      .onEnd(e => {
        'worklet';
        if (scale.value > MIN_SCALE + 0.01) {
          scale.value = withTiming(MIN_SCALE, TIMING);
          tx.value = withTiming(0, TIMING);
          ty.value = withTiming(0, TIMING);
          savedScale.value = MIN_SCALE;
          savedTx.value = 0;
          savedTy.value = 0;
          setZoomedUI(false);
          return;
        }
        // Zoom about the tapped point, then pull it back inside the bounds so
        // the jump can never land on a gutter.
        const fx = e.x - width / 2;
        const fy = e.y - height / 2;
        const lx = (width * (DOUBLE_TAP_SCALE - 1)) / 2;
        const ly = (height * (DOUBLE_TAP_SCALE - 1)) / 2;
        const nx = clamp(-fx * (DOUBLE_TAP_SCALE - 1), -lx, lx);
        const ny = clamp(-fy * (DOUBLE_TAP_SCALE - 1), -ly, ly);
        scale.value = withTiming(DOUBLE_TAP_SCALE, TIMING);
        tx.value = withTiming(nx, TIMING);
        ty.value = withTiming(ny, TIMING);
        savedScale.value = DOUBLE_TAP_SCALE;
        savedTx.value = nx;
        savedTy.value = ny;
        setZoomedUI(true);
      });

    // Pinch and the zoom-pan cooperate; the dismiss pan and the double tap each
    // race for the touch on their own.
    return Gesture.Exclusive(Gesture.Simultaneous(pinch, panZoom), panDismiss, doubleTap);
  }, [panEnabled, width, height, backdrop, commitZoom, onDismiss, scale, savedScale, tx, ty, savedTx, savedTy, focalX, focalY, isZoomed]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }]
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, imageStyle]}>
        <Image
          source={{ uri }}
          style={{ width, height }}
          contentFit="contain"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={uri}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Product photo"
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = {
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Pills rather than bare glyphs: both sit on top of the photo, which can be
  // any colour at all.
  counter: { paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }
};
