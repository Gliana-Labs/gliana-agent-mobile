/**
 * One entry, full screen, with the vote button on it.
 *
 * The grid answers "what is here"; this answers "is it any good". A video in a
 * 180px cell cannot be judged and a track cut to eight seconds cannot either,
 * so tapping an entry opens it at full size with real playback — and the vote
 * lives here, where the decision is actually made.
 */
import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { colors, font, radius, space } from '../../theme';
import type { ThemeKind } from '../../arena/config';
import { shortAddress } from '../../arena/client';

export function EntryViewer({
  visible,
  kind,
  uri,
  entrant,
  votes,
  canVote,
  busy,
  onVote,
  onClose,
}: {
  visible: boolean;
  kind: ThemeKind;
  uri: string;
  entrant: string;
  votes: number;
  canVote: boolean;
  busy: boolean;
  onVote: () => void;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const side = Math.min(width - space(6), height * 0.52);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={st.scrim} onPress={onClose}>
        {/* The sheet swallows taps so a press on the media never closes it —
            tapping a video is how you unmute it. */}
        <Pressable style={st.sheet} onPress={() => {}}>
          {kind === 'video' ? (
            <BigVideo uri={uri} side={side} visible={visible} />
          ) : kind === 'music' ? (
            <BigAudio uri={uri} side={side} visible={visible} />
          ) : (
            <Image source={{ uri }} style={{ width: side, height: side, borderRadius: radius.sm }} contentFit="contain" />
          )}

          <View style={st.row}>
            <Text style={st.who}>{shortAddress(entrant)}</Text>
            <Text style={st.votes}>
              {votes} {votes === 1 ? 'vote' : 'votes'}
            </Text>
          </View>

          {canVote ? (
            <Pressable onPress={onVote} disabled={busy} style={[st.vote, busy && st.voteBusy]}>
              <Text style={st.voteText}>{busy ? 'Voting…' : 'Vote for this'}</Text>
            </Pressable>
          ) : null}

          <Pressable onPress={onClose} style={st.close}>
            <Text style={st.closeText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Full playback with sound on — this is the judging view, not the scan view. */
function BigVideo({ uri, side, visible }: { uri: string; side: number; visible: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
  });
  // In an effect, not in render: calling play() while rendering is a side
  // effect React may run twice or not at all, and it is how the grid's
  // autoplay became unreliable. Opening starts it, closing stops it — or audio
  // keeps playing behind a dismissed modal.
  useEffect(() => {
    if (!visible) {
      player.pause();
      return;
    }
    let cancelled = false;
    void (async () => {
      // initSfx sets a global playsInSilentMode:false for the arcade blips.
      // An entry the voter opened is not a blip, and that policy silences it.
      try {
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
      } catch {
        /* a preference, not a precondition */
      }
      if (!cancelled) player.play();
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, player]);
  return (
    <VideoView
      player={player}
      style={{ width: side, height: side, borderRadius: radius.sm }}
      contentFit="contain"
      nativeControls
    />
  );
}

/** The whole track, not the eight-second hook the grid plays. */
function BigAudio({ uri, side, visible }: { uri: string; side: number; visible: boolean }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const playing = status?.playing ?? false;
  const loaded = status?.isLoaded ?? false;
  // Same trap as the grid cell: play() before the player reports loaded is a
  // silent no-op, which is why the viewer opened showing 0:05 for a 20-second
  // track and never made a sound.
  const [want, setWant] = useState(false);
  useEffect(() => {
    if (!want || !loaded || playing) return;
    let cancelled = false;
    void (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
      } catch {
        /* a preference, not a precondition */
      }
      if (!cancelled) player.play();
    })();
    return () => {
      cancelled = true;
    };
  }, [want, loaded, playing, player]);
  const dur = status?.duration ?? 0;
  const pos = status?.currentTime ?? 0;
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;

  if (!visible && playing) player.pause();

  return (
    <View style={[st.audio, { width: side, height: side }]}>
      <Pressable
        onPress={() => {
          if (playing) {
            setWant(false);
            player.pause();
          } else {
            setWant(true);
          }
        }}
        style={st.playBtn}
      >
        <Text style={st.playGlyph}>{playing ? '❚❚' : want ? '…' : '▶'}</Text>
      </Pressable>
      <View style={st.track}>
        <View style={[st.trackFill, { width: `${pct}%` }]} />
      </View>
      <Text style={st.time}>
        {fmt(pos)} / {dur > 0 ? fmt(dur) : '--:--'}
      </Text>
    </View>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const st = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', alignItems: 'center', justifyContent: 'center', padding: space(3) },
  sheet: { alignItems: 'center', gap: space(3) },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: space(1) },
  who: { color: colors.textDim, fontSize: 12, fontFamily: font.mono },
  votes: { color: colors.text, fontSize: 11, fontFamily: font.pixel },
  vote: { backgroundColor: colors.flame, paddingVertical: space(3), paddingHorizontal: space(8), borderRadius: radius.sm },
  voteBusy: { opacity: 0.6 },
  voteText: { color: '#0a0a0d', fontSize: 11, fontFamily: font.pixel },
  close: { paddingVertical: space(2), paddingHorizontal: space(5) },
  closeText: { color: colors.textDim, fontSize: 12 },
  audio: { alignItems: 'center', justifyContent: 'center', gap: space(4), backgroundColor: colors.surface, borderRadius: radius.sm },
  playBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  playGlyph: { color: colors.flame, fontSize: 26 },
  track: { width: '70%', height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  trackFill: { height: 4, backgroundColor: colors.flame },
  time: { color: colors.textDim, fontSize: 11, fontFamily: font.mono },
});
