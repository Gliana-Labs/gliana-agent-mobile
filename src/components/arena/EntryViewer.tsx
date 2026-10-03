/**
 * One entry, full screen, with the vote button on it.
 *
 * The grid answers "what is here"; this answers "is it any good". A video in a
 * 180px cell cannot be judged and a track cut to eight seconds cannot either,
 * so tapping an entry opens it at full size with real playback — and the vote
 * lives here, where the decision is actually made.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, useWindowDimensions, PanResponder } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { colors, font, radius, space } from '../../theme';
import { kindForUri, type ThemeKind } from '../../arena/config';
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
  // The FILE decides, exactly as the grid poster does. Taking the round's kind
  // here rendered a clip and a track as <Image> — the modal opened on a still
  // nothing could play, which is not a playback bug but a routing one.
  const actual = kindForUri(uri) ?? kind;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={st.scrim} onPress={onClose}>
        {/* The sheet swallows taps so a press on the media never closes it —
            tapping a video is how you unmute it. */}
        <Pressable style={st.sheet} onPress={() => {}}>
          {actual === 'video' ? (
            <BigVideo uri={uri} side={side} visible={visible} />
          ) : actual === 'music' ? (
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
  // NATIVE controls, and nothing wrapped around them.
  //
  // They give play, pause and click-to-seek for free, which a hand-rolled bar
  // took three goes to get wrong: VideoView swallows touches on Android, so a
  // Pressable around it never fires — that is why the controls looked like
  // they "weren't showing" and why pause did nothing. The control surface has
  // to BE the video, not a layer over it.
  return (
    <VideoView
      player={player}
      style={{ width: side, height: side, borderRadius: radius.sm }}
      contentFit="contain"
      nativeControls
      allowsPictureInPicture={false}
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
      <Scrubber position={pos} duration={dur} onSeek={(t) => void player.seekTo(t)} />
    </View>
  );
}


/**
 * Tap or drag anywhere on the bar to seek.
 *
 * expo-video's native controls are an overlay that has to be summoned and did
 * not survive being inside the modal, and a progress bar you cannot move is
 * just decoration — if someone is judging a clip they will want to go back to
 * the bit that mattered.
 */
function Scrubber({
  position,
  duration,
  onSeek,
}: {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const [width, setWidth] = useState(0);
  // While dragging, the thumb follows the finger rather than the player, or it
  // snaps back on every status tick until the seek lands.
  const [dragging, setDragging] = useState<number | null>(null);
  const at = (x: number) => {
    if (width <= 0 || duration <= 0) return 0;
    return Math.max(0, Math.min(1, x / width)) * duration;
  };
  const shown = dragging ?? position;
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;

  // Rebuilt when the measurement or the duration changes: the handlers close
  // over both, and a bar measured at zero would seek to zero forever.
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => setDragging(at(e.nativeEvent.locationX)),
        onPanResponderMove: (e) => setDragging(at(e.nativeEvent.locationX)),
        onPanResponderRelease: (e) => {
          const t = at(e.nativeEvent.locationX);
          setDragging(null);
          onSeek(t);
        },
        onPanResponderTerminate: () => setDragging(null),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, duration, onSeek],
  );

  return (
    <View style={st.scrubWrap}>
      <View
        style={st.scrubHit}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
      >
        <View style={st.track}>
          <View style={[st.trackFill, { width: `${pct}%` }]} />
        </View>
        <View style={[st.thumb, { left: `${pct}%` }]} />
      </View>
      <Text style={st.time}>
        {fmt(shown)} / {duration > 0 ? fmt(duration) : '--:--'}
      </Text>
    </View>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const st = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', alignItems: 'center', justifyContent: 'center', padding: space(3) },
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
  scrubWrap: { width: '100%', alignItems: 'center', gap: space(2) },
  scrubHit: { width: '86%', height: 28, justifyContent: 'center' },
  thumb: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: colors.flame, marginLeft: -7 },
  track: { width: '100%', height: 5, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: 5, backgroundColor: colors.flame },
  time: { color: colors.textDim, fontSize: 11, fontFamily: font.mono },
});
