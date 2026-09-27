/**
 * The in-app camera.
 *
 * It replaces `ImagePicker.launchCameraAsync`, which hands off to the system
 * camera app: a cold start, a second app's UI, a confirm screen, and a return
 * trip — three or four seconds before you have a photo, and none of it looks
 * like this app. Here the preview is already live when the sheet opens, so the
 * shutter is the first thing you touch.
 *
 * The photo is also resized to 1280px on its long edge before it leaves the
 * phone. A 12-megapixel JPEG is ~5MB over a mobile connection for an image the
 * model renders at a fraction of that, and the upload was most of the wait
 * between the shutter and the price.
 */
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { colors, font, space } from '../theme';
import { play } from '../lib/sfx';

/** Long edge after resize. Kontext works from this happily and it uploads fast. */
const MAX_EDGE = 1280;

export function Viewfinder({
  visible,
  onShot,
  onClose,
}: {
  visible: boolean;
  onShot: (uri: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [busy, setBusy] = useState(false);
  const cam = useRef<CameraView>(null);

  async function shoot() {
    if (!cam.current || busy) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    play('tap');
    try {
      const shot = await cam.current.takePictureAsync({ quality: 0.9, skipProcessing: true });
      if (!shot?.uri) return;
      // Resize before it ever touches the network.
      const ctx = ImageManipulator.manipulate(shot.uri);
      ctx.resize({ width: MAX_EDGE });
      const image = await ctx.renderAsync();
      const out = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
      onShot(out.uri);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView ref={cam} style={StyleSheet.absoluteFill} facing={facing} />
        ) : (
          <View style={styles.ask}>
            <Text style={styles.askText}>
              {permission
                ? 'Camera access is off. Allow it to snap a photo and restyle it.'
                : 'Checking the camera…'}
            </Text>
            {permission && !permission.granted ? (
              <Pressable onPress={() => void requestPermission()} style={styles.askBtn}>
                <Text style={styles.askBtnText}>ALLOW CAMERA</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* Chrome sits over the preview, in the app's own language rather than
            the system camera's. Nothing here dims the image: a viewfinder you
            cannot see through is not a viewfinder. */}
        <View style={styles.top}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.chip}>
            <Text style={styles.chipText}>✕</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            hitSlop={12}
            style={styles.chip}
          >
            <Text style={styles.chipText}>↺</Text>
          </Pressable>
        </View>

        <View style={styles.bottom}>
          <Text style={styles.hint}>SNAP SOMETHING</Text>
          <Pressable onPress={() => void shoot()} disabled={busy || !permission?.granted} style={styles.shutter}>
            {busy ? <ActivityIndicator color={colors.ink} /> : <View style={styles.shutterCore} />}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  ask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(6),
    gap: space(4),
  },
  askText: { color: colors.text, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  askBtn: { borderWidth: 2, borderColor: colors.flame, borderRadius: 4, paddingHorizontal: space(5), paddingVertical: space(3) },
  askBtnText: { color: colors.flameSoft, fontFamily: font.pixel, fontSize: 10 },
  top: { position: 'absolute', top: space(12), left: space(4), right: space(4), flexDirection: 'row', alignItems: 'center' },
  chip: {
    width: 44,
    height: 44,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { color: '#fff', fontSize: 16 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: space(10), alignItems: 'center', gap: space(4) },
  hint: {
    color: '#fff',
    fontFamily: font.pixel,
    fontSize: 9,
    letterSpacing: 1,
    textShadowColor: '#000',
    textShadowRadius: 6,
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.flame,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.flame },
});
