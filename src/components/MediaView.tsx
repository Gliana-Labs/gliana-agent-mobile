/**
 * Renders a paid generation's output (image / video / audio / raw JSON) plus a
 * Save button. expo-image / expo-video / expo-audio each need their hook called
 * unconditionally, so video + audio live in their own sub-components.
 *
 * Save = download the file to cache, then open the OS share sheet (expo-sharing)
 * — that gives "Save Image" / "Save to Files" / share, works for every media
 * type, and needs no storage permission.
 */
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { colors, radius, space } from '../theme';
import { DownloadIcon, PauseIcon, PlayIcon } from './icons';
import { FullscreenImage } from './FullscreenImage';
import type { GenerationResult } from '../types';

export function MediaView({ result }: { result: GenerationResult }) {
  const { url, contentType } = result;
  if (!url) {
    return (
      <View style={styles.rawBox}>
        <Text style={styles.rawText}>{JSON.stringify(result.raw ?? {}, null, 2)}</Text>
      </View>
    );
  }
  const kind = mediaKind(contentType, url);
  const media =
    kind === 'image' ? (
      <ImageResult uri={url} />
    ) : kind === 'video' ? (
      <VideoResult uri={url} />
    ) : kind === 'audio' ? (
      <AudioResult uri={url} />
    ) : (
      <Pressable style={styles.linkBox} onPress={() => Linking.openURL(url)}>
        <Text style={styles.linkText}>Open output ↗</Text>
      </Pressable>
    );

  const kindForSave = mediaKind(contentType, url);
  return (
    <View style={{ gap: space(2.5) }}>
      {media}
      <ResultActions url={url} contentType={contentType} canSaveToGallery={kindForSave !== 'file'} />
    </View>
  );
}

function ResultActions({
  url,
  contentType,
  canSaveToGallery,
}: {
  url: string;
  contentType?: string;
  canSaveToGallery: boolean;
}) {
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);

  async function download(): Promise<string> {
    const ext = extFor(contentType, url);
    const target = `${FileSystem.cacheDirectory}gliana-${Date.now()}.${ext}`;
    const { uri } = await FileSystem.downloadAsync(url, target);
    return uri;
  }

  // Save to the device gallery (Photos) — the real "save to file" on mobile for
  // image/video/audio. Requests the media permission on first use.
  async function onSave() {
    setBusy('save');
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow media access to save to your device.');
        return;
      }
      const uri = await download();
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Saved to your device gallery.');
    } catch {
      Alert.alert('Could not save', 'Try Share instead, or open the file.');
    } finally {
      setBusy(null);
    }
  }

  async function onShare() {
    setBusy('share');
    try {
      const uri = await download();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: contentType || undefined, dialogTitle: 'Share' });
      } else {
        await Linking.openURL(url);
      }
    } catch {
      await Linking.openURL(url).catch(() => {});
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.actions}>
      {canSaveToGallery && (
        <Pressable style={[styles.actionBtn, styles.actionPrimary]} onPress={onSave} disabled={busy !== null}>
          {busy === 'save' ? (
            <ActivityIndicator size="small" color="#0a0a0d" />
          ) : (
            <DownloadIcon size={15} color="#0a0a0d" />
          )}
          <Text style={styles.actionPrimaryText}>{busy === 'save' ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      )}
      <Pressable style={[styles.actionBtn, styles.actionGhost]} onPress={onShare} disabled={busy !== null}>
        {busy === 'share' ? (
          <ActivityIndicator size="small" color={colors.flameSoft} />
        ) : (
          <Text style={styles.actionGhostText}>Share</Text>
        )}
      </Pressable>
    </View>
  );
}

function extFor(ct: string | undefined, url: string): string {
  const t = (ct ?? '').toLowerCase();
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
    'audio/ogg': 'ogg', 'audio/mp4': 'm4a',
  };
  if (map[t]) return map[t];
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{2,4}$/.test(ext) ? ext : 'bin';
}

function mediaKind(ct: string | undefined, url: string): 'image' | 'video' | 'audio' | 'file' {
  const t = (ct ?? '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
  return 'file';
}

function ImageResult({ uri }: { uri: string }) {
  const [zoom, setZoom] = useState(false);
  return (
    <>
      <Pressable onPress={() => setZoom(true)}>
        <Image source={{ uri }} style={styles.image} contentFit="contain" transition={200} />
        <View style={styles.zoomBadge}>
          <Text style={styles.zoomBadgeText}>Tap to zoom</Text>
        </View>
      </Pressable>
      <FullscreenImage uri={uri} visible={zoom} onClose={() => setZoom(false)} />
    </>
  );
}

function VideoResult({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} style={styles.video} contentFit="contain" nativeControls />;
}

function AudioResult({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;

  function toggle() {
    if (playing) player.pause();
    else {
      if (status.didJustFinish) player.seekTo(0);
      player.play();
    }
  }

  return (
    <Pressable style={styles.audio} onPress={toggle}>
      <View style={styles.audioBtn}>{playing ? <PauseIcon color="#0a0a0d" /> : <PlayIcon color="#0a0a0d" />}</View>
      <Text style={styles.audioLabel}>{playing ? 'Playing…' : 'Play audio'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, backgroundColor: colors.ink2 },
  zoomBadge: {
    position: 'absolute',
    right: space(2.5),
    bottom: space(2.5),
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  zoomBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, backgroundColor: '#000' },
  audio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space(3),
  },
  audioBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.flameSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioLabel: { color: colors.textDim, fontSize: 14 },
  actions: { flexDirection: 'row', gap: space(2) },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    borderRadius: radius.md,
    paddingVertical: space(2.5),
  },
  actionPrimary: { backgroundColor: colors.flameSoft },
  actionPrimaryText: { color: '#0a0a0d', fontSize: 13, fontWeight: '700' },
  actionGhost: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  actionGhostText: { color: colors.flameSoft, fontSize: 13, fontWeight: '600' },
  rawBox: { backgroundColor: colors.ink2, borderRadius: radius.md, padding: space(3) },
  rawText: { color: colors.textDim, fontFamily: 'monospace', fontSize: 12 },
  linkBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(3),
    alignItems: 'center',
  },
  linkText: { color: colors.flameSoft, fontSize: 14, fontWeight: '600' },
});
