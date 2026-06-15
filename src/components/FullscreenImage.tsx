/**
 * Fullscreen image viewer with pinch-to-zoom + pan + double-tap reset. Uses
 * react-native-gesture-handler with RN's built-in Animated (no reanimated, so
 * no babel worklet plugin). Tap the dimmed background or ✕ to close.
 */
import { useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  State,
  TapGestureHandler,
} from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { colors, space } from '../theme';

export function FullscreenImage({ uri, visible, onClose }: { uri: string; visible: boolean; onClose: () => void }) {
  const { width, height } = useWindowDimensions();

  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);
  const lastScale = useRef(1);

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastX = useRef(0);
  const lastY = useRef(0);

  const pinchRef = useRef(null);
  const panRef = useRef(null);
  const doubleTapRef = useRef(null);

  function reset() {
    lastScale.current = 1;
    lastX.current = 0;
    lastY.current = 0;
    translateX.setOffset(0);
    translateY.setOffset(0);
    Animated.parallel([
      Animated.spring(baseScale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(pinchScale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
  }

  const onPinch = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true });
  function onPinchState(e: { nativeEvent: { oldState: number; scale: number } }) {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      lastScale.current = Math.max(1, Math.min(lastScale.current * e.nativeEvent.scale, 5));
      baseScale.setValue(lastScale.current);
      pinchScale.setValue(1);
      if (lastScale.current === 1) reset();
    }
  }

  const onPan = Animated.event([{ nativeEvent: { translationX: translateX, translationY: translateY } }], {
    useNativeDriver: true,
  });
  function onPanState(e: { nativeEvent: { oldState: number; translationX: number; translationY: number } }) {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      lastX.current += e.nativeEvent.translationX;
      lastY.current += e.nativeEvent.translationY;
      translateX.setOffset(lastX.current);
      translateX.setValue(0);
      translateY.setOffset(lastY.current);
      translateY.setValue(0);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <PanGestureHandler
          ref={panRef}
          minPointers={1}
          avgTouches
          simultaneousHandlers={pinchRef}
          onGestureEvent={onPan}
          onHandlerStateChange={onPanState}
        >
          <Animated.View style={styles.center}>
            <PinchGestureHandler
              ref={pinchRef}
              simultaneousHandlers={panRef}
              onGestureEvent={onPinch}
              onHandlerStateChange={onPinchState}
            >
              <Animated.View>
                <TapGestureHandler ref={doubleTapRef} numberOfTaps={2} onActivated={reset}>
                  {/* Transform lives on the Animated.View — expo-image's <Image> is
                      not an animated component, so Animated.Values on its own
                      transform throw "translateX must be a number or percentage". */}
                  <Animated.View style={{ transform: [{ translateX }, { translateY }, { scale }] }}>
                    <Image source={{ uri }} style={{ width, height: height * 0.8 }} contentFit="contain" />
                  </Animated.View>
                </TapGestureHandler>
              </Animated.View>
            </PinchGestureHandler>
          </Animated.View>
        </PanGestureHandler>

        <Pressable style={styles.close} onPress={onClose} hitSlop={12}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Text style={styles.hint}>pinch to zoom · double-tap to reset</Text>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', top: space(12), right: space(5) },
  closeText: { color: '#fff', fontSize: 26, fontWeight: '300' },
  hint: { position: 'absolute', bottom: space(10), alignSelf: 'center', color: colors.textFaint, fontSize: 12 },
});
