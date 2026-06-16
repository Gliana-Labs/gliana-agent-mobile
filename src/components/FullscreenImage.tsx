/**
 * Fullscreen image viewer with pinch-to-zoom + pan + double-tap reset, built on
 * react-native-reanimated + the modern gesture-handler Gesture API. This is the
 * Fabric-native way — the legacy Animated transform path throws an invariant on
 * the new architecture. Tap the dimmed background or ✕ to close.
 */
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { colors, space } from '../theme';

export function FullscreenImage({ uri, visible, onClose }: { uri: string; visible: boolean; onClose: () => void }) {
  const { width, height } = useWindowDimensions();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), 6);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });

  // maxPointers(1): pan only with ONE finger, so it never fights the two-finger
  // pinch (the bug that made pinch feel like it wasn't working).
  const pan = Gesture.Pan()
    .maxPointers(1)
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <GestureDetector gesture={gesture}>
          <Animated.View style={styles.center}>
            <Animated.View style={imageStyle}>
              <Image source={{ uri }} style={{ width, height: height * 0.82 }} contentFit="contain" />
            </Animated.View>
          </Animated.View>
        </GestureDetector>

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
