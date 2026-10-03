/**
 * What an Arena entry looks like in the grid.
 *
 * These are POSTERS, not players: a still frame, a waveform, a picture, each
 * with a badge saying what it is. Nothing autoplays and nothing makes a sound.
 * Four cells playing at once is four decoders, a hot phone and audio from a
 * tile the voter cannot even see — and a grid that plays itself still cannot
 * be judged, because a clip in a 180px square tells you nothing. Tapping opens
 * the entry full screen, which is where it plays and where the vote is cast.
 */
import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { colors, font, space } from '../../theme';
import { kindForUri, type ThemeKind } from '../../arena/config';

export function EntryMedia({
  kind,
  uri,
  size,
}: {
  /** The round's medium — the fallback when the URL does not say. */
  kind: ThemeKind;
  uri: string;
  size: number;
}) {
  // Trust the file over the round. `enter` is permissionless and takes any
  // URI, so a round CAN hold an entry of another medium; rendering it as the
  // round's kind put an mp3 in a video view — a black tile playing sound
  // nobody asked for.
  const actual = kindForUri(uri) ?? kind;
  if (actual === 'video') return <VideoPoster uri={uri} size={size} />;
  if (actual === 'music') return <MusicPoster size={size} />;
  return <ImageCell uri={uri} size={size} />;
}

function ImageCell({ uri, size }: { uri: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Fail size={size} />;
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size }}
      contentFit="cover"
      transition={160}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * A paused player, which renders the first frame. expo-video has no thumbnail
 * API, and a frame from the clip itself is a truer poster than anything we
 * could generate.
 */
function VideoPoster({ uri, size }: { uri: string; size: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.pause();
  });
  return (
    <View style={{ width: size, height: size }}>
      <VideoView
        player={player}
        style={{ width: size, height: size }}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      <Badge text="▶  VIDEO" />
    </View>
  );
}

/**
 * No audio player at all. A waveform says "this is a track"; loading one per
 * cell to play nothing is cost without a reason.
 */
function MusicPoster({ size }: { size: number }) {
  return (
    <View style={[s.music, { width: size, height: size }]}>
      <View style={s.bars}>
        {BAR_HEIGHTS.map((h, i) => (
          <View key={i} style={[s.bar, { height: `${h}%`, backgroundColor: colors.border }]} />
        ))}
      </View>
      <Badge text="♪  TRACK" />
    </View>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>{text}</Text>
    </View>
  );
}

function Fail({ size }: { size: number }) {
  return (
    <View style={[s.fail, { width: size, height: size }]}>
      <Text style={s.failText}>can't load</Text>
    </View>
  );
}

/** Fixed, not random: a waveform that reshuffled on every render reads as a glitch. */
const BAR_HEIGHTS = [34, 62, 45, 80, 55, 92, 48, 70, 38, 60, 84, 42];

const s = StyleSheet.create({
  badge: { position: 'absolute', left: space(2), bottom: space(2), backgroundColor: 'rgba(0,0,0,0.62)', paddingHorizontal: space(2), paddingVertical: space(1), borderRadius: 3 },
  badgeText: { color: colors.text, fontSize: 7, fontFamily: font.pixel },
  music: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, gap: space(3) },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: '46%' },
  bar: { width: 5, borderRadius: 2 },
  fail: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  failText: { color: colors.textDim, fontSize: 11 },
});
