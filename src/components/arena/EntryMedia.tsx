/**
 * What an Arena entry looks like, per medium.
 *
 * The round decides the medium (see `kindFor`), so a gallery renders ONE of
 * these throughout and never mixes them — a silent thumbnail next to a track
 * is not a fair contest, and the voter cannot tell what they are being asked
 * to judge.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { colors, font, space } from '../../theme';
import type { ThemeKind } from '../../arena/config';

/** How long a music entry previews before looping. You judge a hook. */
const PREVIEW_SECONDS = 8;

export function EntryMedia({
  kind,
  uri,
  size,
  active,
}: {
  kind: ThemeKind;
  uri: string;
  size: number;
  /** True when this cell is the one on screen — only one video plays at a time. */
  active?: boolean;
}) {
  if (kind === 'video') return <VideoCell uri={uri} size={size} active={active ?? false} />;
  if (kind === 'music') return <MusicCell uri={uri} size={size} />;
  return <ImageCell uri={uri} size={size} />;
}

function ImageCell({ uri, size }: { uri: string; size: number }) {
  // A blank tile is indistinguishable from a bug, so a failed load says so.
  const [failed, setFailed] = useState(false);
  if (failed) return <Fail size={size} label="image unavailable" />;
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
 * Muted autoplay, tap for sound — the feed behaviour, not a play button.
 *
 * A grid of images is judged by scanning. A grid of videos each needing a tap
 * to start is judged by nobody, which is the whole reason video rounds were not
 * shipped with a play control.
 */
function VideoCell({ uri, size, active }: { uri: string; size: number; active: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    // Autoplay only while on screen: four videos playing at once is four
    // decoders and a hot phone.
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return (
    <Pressable
      onPress={() => {
        const next = !muted;
        setMuted(next);
        player.muted = next;
        if (!next) player.play();
      }}
      style={{ width: size, height: size }}
    >
      <VideoView
        player={player}
        style={{ width: size, height: size }}
        contentFit="cover"
        nativeControls={false}
        // The cell IS the control; picture-in-picture here steals the tap that
        // toggles sound.
        allowsPictureInPicture={false}
      />
      <View style={s.badge}>
        <Text style={s.badgeText}>{muted ? 'TAP FOR SOUND' : 'SOUND ON'}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Music cannot be scanned, so it is not drawn as a thumbnail.
 *
 * A fixed bar field stands in for a waveform: real peaks would mean decoding
 * every entry before the grid could render, which is the opposite of fast. The
 * bars animate only while playing, so motion means "this is the one you hear".
 */
function MusicCell({ uri, size }: { uri: string; size: number }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  // Intent, not state. play() on a player that has not finished loading is a
  // silent no-op in expo-audio — it returns, the status stays paused at
  // position 0, and nothing ever comes out of the speaker. So the tap records
  // that the listener WANTS it, and an effect starts playback once the player
  // says it is loaded.
  const [want, setWant] = useState(false);
  const loaded = status?.isLoaded ?? false;
  const playing = status?.playing ?? false;
  const stop = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!want || !loaded || playing) return;
    let cancelled = false;
    void (async () => {
      try {
        await player.seekTo(0);
      } catch {
        /* a player that cannot seek can still play from where it is */
      }
      if (cancelled) return;
      // initSfx sets a GLOBAL audio mode for the arcade blips: playsInSilentMode
      // false, so a UI chirp never rings out of a silenced phone. An entry is
      // not a chirp — someone asked to hear it — and that global policy was
      // swallowing play() entirely: loaded, ready, no error, position stuck at
      // zero. Opt this playback out of it.
      try {
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
      } catch {
        /* audio mode is a preference, not a precondition — try to play anyway */
      }
      if (cancelled) return;
      player.play();
      // Preview, not playback: the voter hears a hook from every entry rather
      // than one track in full.
      stop.current = setTimeout(() => {
        player.pause();
        setWant(false);
      }, PREVIEW_SECONDS * 1000);
    })();
    return () => {
      cancelled = true;
    };
  }, [want, loaded, playing, player]);

  useEffect(() => {
    return () => {
      if (stop.current) clearTimeout(stop.current);
    };
  }, []);

  const toggle = () => {
    if (stop.current) clearTimeout(stop.current);
    if (want || playing) {
      setWant(false);
      player.pause();
      return;
    }
    setWant(true);
  };

  const bars = BAR_HEIGHTS.slice(0, Math.max(10, Math.floor(size / 14)));

  return (
    <Pressable onPress={() => void toggle()} style={[s.music, { width: size, height: size }]}>
      <View style={s.bars}>
        {bars.map((h, i) => (
          <View
            key={i}
            style={[
              s.bar,
              { height: `${playing ? h : h * 0.45}%`, backgroundColor: playing ? colors.flame : colors.border },
            ]}
          />
        ))}
      </View>
      <Text style={s.musicLabel}>{playing ? `${PREVIEW_SECONDS}s PREVIEW` : want ? 'LOADING…' : 'TAP TO HEAR'}</Text>
    </Pressable>
  );
}

function Fail({ size, label }: { size: number; label: string }) {
  return (
    <View style={[s.fail, { width: size, height: size }]}>
      <Text style={s.failText}>{label}</Text>
    </View>
  );
}

// Fixed, not random: a field that reshuffles on every render reads as noise.
const BAR_HEIGHTS = [38, 62, 90, 54, 76, 100, 44, 82, 58, 94, 48, 70, 86, 52, 66, 98, 42, 74];

const s = StyleSheet.create({
  badge: { position: 'absolute', left: space(2), bottom: space(2), backgroundColor: 'rgba(0,0,0,0.62)', paddingHorizontal: space(2), paddingVertical: space(1), borderRadius: 3 },
  badgeText: { color: colors.text, fontSize: 7, fontFamily: font.pixel },
  music: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, gap: space(3) },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: '46%' },
  bar: { width: 5, borderRadius: 2 },
  musicLabel: { color: colors.textDim, fontSize: 8, fontFamily: font.pixel },
  fail: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  failText: { color: colors.textDim, fontSize: 11 },
});
