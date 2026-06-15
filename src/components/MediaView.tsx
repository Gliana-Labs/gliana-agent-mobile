/**
 * Renders a paid generation's output: image, video, audio, or raw JSON.
 * expo-image / expo-video / expo-audio each need their hook called
 * unconditionally, so video + audio live in their own sub-components.
 */
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors, radius, space } from '../theme';
import { PauseIcon, PlayIcon } from './icons';
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
  if (kind === 'image') {
    return <Image source={{ uri: url }} style={styles.image} contentFit="contain" transition={200} />;
  }
  if (kind === 'video') return <VideoResult uri={url} />;
  if (kind === 'audio') return <AudioResult uri={url} />;
  return (
    <Pressable style={styles.linkBox} onPress={() => Linking.openURL(url)}>
      <Text style={styles.linkText}>Open output ↗</Text>
    </Pressable>
  );
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

function VideoResult({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} style={styles.video} contentFit="contain" nativeControls />;
}

function AudioResult({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [touched, setTouched] = useState(false);
  const playing = status.playing;

  function toggle() {
    setTouched(true);
    if (playing) player.pause();
    else {
      if (touched && status.didJustFinish) player.seekTo(0);
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
