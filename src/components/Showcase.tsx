/**
 * Showcase — a full-screen gallery of generated samples (media + model + prompt).
 * Seeded from the gateway's example data (src/lib/showcase.json, built by
 * scripts/build-showcase.mjs). FlatList keeps it light on long lists; videos are
 * tap-to-play; any media that fails to load hides its own card. "Make this"
 * closes the gallery and prefills the composer with that model.
 */
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import showcase from '../lib/showcase.json';
import { colors, radius, space } from '../theme';

type Item = {
  id: string;
  runId: string;
  model: string;
  category: string;
  type: 'image' | 'video' | 'audio';
  url: string;
  prompt: string;
  title?: string;
};

const ITEMS = showcase.items as unknown as Item[];
const LABEL: Record<string, string> = { all: 'All', image: 'Image', video: 'Video', voice: 'Voice', music: 'Music', brainrot: 'Brainrot' };
const ORDER = ['image', 'video', 'voice', 'music', 'brainrot'];

export function Showcase({ visible, onClose, onMake }: { visible: boolean; onClose: () => void; onMake: (runId: string) => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cats = useMemo(() => ['all', ...ORDER.filter((c) => ITEMS.some((i) => i.category === c))], []);
  const [active, setActive] = useState('all');
  const data = useMemo(() => (active === 'all' ? ITEMS : ITEMS.filter((i) => i.category === active)), [active]);
  const colW = (width - space(3) * 3) / 2;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Showcase</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        <FlatList
          data={data}
          keyExtractor={(it) => it.url}
          numColumns={2}
          columnWrapperStyle={{ gap: space(3), paddingHorizontal: space(3) }}
          contentContainerStyle={{ gap: space(3), paddingBottom: insets.bottom + space(6) }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            <View style={styles.head}>
              <Text style={styles.h1}>
                Made with <Text style={{ color: colors.flameSoft }}>GlianaAI</Text>
              </Text>
              <Text style={styles.sub}>Real output from the catalog — tap a model to make your own.</Text>
              <View style={styles.chips}>
                {cats.map((c) => (
                  <Pressable key={c} onPress={() => setActive(c)} style={[styles.chip, active === c && styles.chipOn]}>
                    <Text style={[styles.chipText, active === c && styles.chipTextOn]}>{LABEL[c] ?? c}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => <Card item={item} w={colW} onMake={onMake} />}
        />
      </View>
    </Modal>
  );
}

function Card({ item, w, onMake }: { item: Item; w: number; onMake: (runId: string) => void }) {
  const [broken, setBroken] = useState(false);
  const [play, setPlay] = useState(false);
  if (broken) return null;

  return (
    <View style={[styles.card, { width: w }]}>
      <View style={[styles.media, { width: w, height: w }]}>
        {item.type === 'image' ? (
          <Image source={{ uri: item.url }} style={styles.fill} contentFit="cover" transition={150} onError={() => setBroken(true)} />
        ) : item.type === 'audio' ? (
          <AudioCard uri={item.url} />
        ) : play ? (
          <VideoPlay uri={item.url} onError={() => setBroken(true)} />
        ) : (
          <Pressable style={[styles.fill, styles.playWrap]} onPress={() => setPlay(true)}>
            <View style={styles.playBtn}>
              <Text style={styles.playGlyph}>▶</Text>
            </View>
          </Pressable>
        )}
      </View>
      <View style={styles.meta}>
        <View style={styles.metaRow}>
          <Text style={styles.catTag}>{(LABEL[item.category] ?? item.category).toUpperCase()}</Text>
          <Text style={styles.model} numberOfLines={1}>
            {item.model}
          </Text>
        </View>
        {!!item.prompt && (
          <Text style={styles.prompt} numberOfLines={2}>
            {item.prompt}
          </Text>
        )}
        <Pressable onPress={() => onMake(item.runId)} hitSlop={6}>
          <Text style={styles.make}>Make this →</Text>
        </Pressable>
      </View>
    </View>
  );
}

function VideoPlay({ uri, onError }: { uri: string; onError: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={styles.fill} contentFit="cover" nativeControls={false} />;
}

// Voice/music have no thumbnail — a speaker tile that plays/pauses on tap. The
// label is driven by the player's REAL status, and rewinds at end of track, so it
// never gets stuck on "Playing…".
function AudioCard({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;

  // Some sources report looping; force it off so a clip plays once.
  useEffect(() => {
    player.loop = false;
  }, [player]);

  useEffect(() => {
    if (status.didJustFinish) {
      player.pause(); // stop (seekTo alone keeps it playing → loops)
      player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  return (
    <Pressable
      style={[styles.fill, styles.audioWrap]}
      onPress={() => (playing ? player.pause() : player.play())}
    >
      <View style={styles.playBtn}>
        <Text style={styles.playGlyph}>{playing ? '❚❚' : '▶'}</Text>
      </View>
      <Text style={styles.audioLabel}>{playing ? 'Playing…' : 'Tap to play'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  close: { paddingHorizontal: space(2), paddingVertical: space(1) },
  closeText: { color: colors.flameSoft, fontSize: 15, fontWeight: '600' },
  head: { paddingHorizontal: space(3), paddingTop: space(4), paddingBottom: space(2) },
  h1: { color: colors.text, fontSize: 24, fontWeight: '700' },
  sub: { color: colors.textDim, fontSize: 13, marginTop: space(1.5), lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(3) },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  chipOn: { borderColor: 'rgba(245,158,11,0.5)', backgroundColor: 'rgba(245,158,11,0.12)' },
  chipText: { color: colors.textDim, fontSize: 12 },
  chipTextOn: { color: colors.flameSoft, fontWeight: '600' },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface },
  media: { backgroundColor: 'rgba(0,0,0,0.4)' },
  fill: { width: '100%', height: '100%' },
  playWrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink3 },
  audioWrap: { alignItems: 'center', justifyContent: 'center', gap: space(2), backgroundColor: colors.ink3 },
  audioLabel: { color: colors.textFaint, fontSize: 11 },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: { color: colors.text, fontSize: 16, marginLeft: 2 },
  meta: { padding: space(2.5) },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  catTag: { color: 'rgba(251,191,36,0.7)', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  model: { color: colors.textFaint, fontSize: 10, fontFamily: 'monospace', flex: 1, textAlign: 'right' },
  prompt: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: space(1.5) },
  make: { color: colors.textFaint, fontSize: 11, marginTop: space(2) },
});
