/**
 * The Arena — a daily contest played with SKR.
 *
 * Three views behind one modal: Today (the theme, the pot, your entry), Gallery
 * (everyone's entries, one vote per wallet) and You (SKR, perks, history).
 *
 * The generation itself is NOT here: you make something in the chat, paid for
 * in USDC exactly as before, and then choose to enter it. Entering after the
 * fact is the point — a model that fails never costs an entry fee.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet } from '../lib/mwa';
import { colors, radius, space } from '../theme';
import { useArena, HOLDER_THRESHOLD } from '../arena/useArena';
import { shortAddress, type EntryWithAddress } from '../arena/client';
import { CLUSTER, skr } from '../arena/config';
import type { GenerationResult } from '../types';

type Tab = 'today' | 'gallery' | 'you';

export function Arena({
  visible,
  onClose,
  results,
}: {
  visible: boolean;
  onClose: () => void;
  /** Finished generations from this device's chats — what you can enter. */
  results: GenerationResult[];
}) {
  const insets = useSafeAreaInsets();
  const { account, signer, connect, connecting } = useWallet();
  const arena = useArena(signer);
  const [tab, setTab] = useState<Tab>('today');

  // Reading the round is free and public; only acting needs a wallet.
  const connected = Boolean(account && signer);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Arena</Text>
            <Text style={styles.sub}>
              {CLUSTER === 'devnet' ? 'Devnet · test SKR' : 'Daily contest · SKR'}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {(['today', 'gallery', 'you'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]}>
              <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
                {t === 'today' ? 'Today' : t === 'gallery' ? `Gallery${arena.entries.length ? ` · ${arena.entries.length}` : ''}` : 'You'}
              </Text>
            </Pressable>
          ))}
        </View>

        {arena.error ? (
          <Pressable onPress={() => void arena.refresh()} style={styles.error}>
            <Text style={styles.errorText}>{arena.error}</Text>
            <Text style={styles.errorHint}>Tap to retry</Text>
          </Pressable>
        ) : null}

        {tab === 'today' ? (
          <Today arena={arena} results={results} connected={connected} onConnect={connect} connecting={connecting} />
        ) : tab === 'gallery' ? (
          <Gallery arena={arena} me={account?.address ?? null} />
        ) : (
          <You arena={arena} address={account?.address ?? null} />
        )}
      </View>
    </Modal>
  );
}

// ── Today ──────────────────────────────────────────────────────────────────

function Today({
  arena,
  results,
  connected,
  onConnect,
  connecting,
}: {
  arena: ReturnType<typeof useArena>;
  results: GenerationResult[];
  connected: boolean;
  onConnect: () => Promise<void>;
  connecting: boolean;
}) {
  const left = useCountdown(arena.endsAt);
  // Only images can be entered: the gallery is a grid people scroll and judge
  // in a second, and a video nobody plays is an entry nobody votes for.
  const enterable = useMemo(
    () => results.filter((r) => Boolean(r.url) && (r.contentType ?? '').startsWith('image/')).slice(0, 12),
    [results],
  );
  const [picked, setPicked] = useState<string | null>(null);

  if (arena.loading) return <Loading />;

  return (
    <FlatList
      data={[]}
      renderItem={null}
      contentContainerStyle={styles.body}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void arena.refresh()} tintColor={colors.flame} />}
      ListHeaderComponent={
        <View>
          <View style={styles.themeCard}>
            <Text style={styles.themeLabel}>TODAY'S THEME</Text>
            <Text style={styles.theme}>{arena.theme}</Text>
            <View style={styles.themeRow}>
              <Stat label="Pot" value={`${skr(arena.pot)} SKR`} />
              <Stat label="Entries" value={String(arena.entries.length)} />
              <Stat label="Ends in" value={left} />
            </View>
          </View>

          {!arena.roundOpen ? (
            <Card>
              <Text style={styles.cardTitle}>Nobody has opened today's round</Text>
              <Text style={styles.cardBody}>
                Rounds are opened by whoever gets there first — there is no server. Opening costs a
                fraction of a cent in rent and gives you no advantage in the round.
              </Text>
              <Action
                label="Open today's round"
                busy={arena.busy}
                disabled={!connected}
                onPress={() => void arena.open()}
              />
              {!connected ? <Connect onConnect={onConnect} connecting={connecting} /> : null}
            </Card>
          ) : arena.mine ? (
            <Card>
              <Text style={styles.cardTitle}>You're in</Text>
              <Image source={{ uri: arena.mine.data.mediaUri }} style={styles.myImage} contentFit="cover" />
              <Text style={styles.cardBody}>
                {arena.mine.data.votes} {arena.mine.data.votes === 1 ? 'vote' : 'votes'} · paid{' '}
                {skr(arena.mine.data.paidFee)} SKR
              </Text>
            </Card>
          ) : (
            <Card>
              <Text style={styles.cardTitle}>Enter today's round</Text>
              <Text style={styles.cardBody}>
                Make something in the chat first — you pay for the generation as normal. Then pick it
                here and pay {skr(arena.fee)} SKR to enter.
                {arena.isHolder ? ' Holder price — 20% off.' : ''}
              </Text>

              {enterable.length === 0 ? (
                <Text style={styles.empty}>No images yet. Make one in the chat and come back.</Text>
              ) : (
                <FlatList
                  horizontal
                  data={enterable}
                  keyExtractor={(r) => r.url!}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: space(2), paddingVertical: space(2) }}
                  renderItem={({ item }) => (
                    <Pressable onPress={() => setPicked(item.url!)}>
                      <Image
                        source={{ uri: item.url! }}
                        style={[styles.pick, picked === item.url! && styles.pickOn]}
                        contentFit="cover"
                      />
                    </Pressable>
                  )}
                />
              )}

              <Action
                label={picked ? `Enter for ${skr(arena.fee)} SKR` : 'Pick an image'}
                busy={arena.busy}
                disabled={!connected || !picked}
                onPress={() => picked && void arena.enter(picked)}
              />
              {!connected ? <Connect onConnect={onConnect} connecting={connecting} /> : null}
            </Card>
          )}

          <Text style={styles.fine}>
            Winner takes 60% of the pot, places 2–5 share 25%, and the wallets that voted for the
            winner early share 15%. Payouts are permissionless once the round ends — anyone can push
            them through, including you.
          </Text>
        </View>
      }
    />
  );
}

// ── Gallery ────────────────────────────────────────────────────────────────

function Gallery({ arena, me }: { arena: ReturnType<typeof useArena>; me: string | null }) {
  const { width } = useWindowDimensions();
  const col = (width - space(3) * 3) / 2;

  if (arena.loading) return <Loading />;
  if (arena.entries.length === 0)
    return <Empty text="No entries yet. Be the first — the early votes are worth the most." />;

  return (
    <FlatList
      data={arena.entries}
      numColumns={2}
      keyExtractor={(e) => e.address}
      contentContainerStyle={styles.body}
      columnWrapperStyle={{ gap: space(3) }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void arena.refresh()} tintColor={colors.flame} />}
      renderItem={({ item, index }) => (
        <EntryCard
          entry={item}
          width={col}
          rank={index}
          mine={item.data.entrant === me}
          canVote={!arena.voted && item.data.entrant !== me}
          busy={arena.busy}
          onVote={() => void arena.vote(item.address)}
        />
      )}
    />
  );
}

function EntryCard({
  entry,
  width,
  rank,
  mine,
  canVote,
  busy,
  onVote,
}: {
  entry: EntryWithAddress;
  width: number;
  rank: number;
  mine: boolean;
  canVote: boolean;
  busy: boolean;
  onVote: () => void;
}) {
  return (
    <View style={[styles.entry, { width }]}>
      <Image source={{ uri: entry.data.mediaUri }} style={{ width, height: width }} contentFit="cover" />
      <View style={styles.entryFoot}>
        <View>
          <Text style={styles.entryVotes}>
            {entry.data.votes} {entry.data.votes === 1 ? 'vote' : 'votes'}
            {rank < 5 && entry.data.votes > 0 ? `  ·  #${rank + 1}` : ''}
          </Text>
          <Text style={styles.entryWho}>{mine ? 'yours' : shortAddress(entry.data.entrant)}</Text>
        </View>
        {canVote ? (
          <Pressable onPress={onVote} disabled={busy} style={styles.voteBtn}>
            <Text style={styles.voteText}>Vote</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ── You ────────────────────────────────────────────────────────────────────

function You({ arena, address }: { arena: ReturnType<typeof useArena>; address: string | null }) {
  if (!address) return <Empty text="Connect a wallet to see your balance and perks." />;

  const toHolder = HOLDER_THRESHOLD - arena.held;

  return (
    <FlatList
      data={[]}
      renderItem={null}
      contentContainerStyle={styles.body}
      ListHeaderComponent={
        <View>
          <Card>
            <Text style={styles.cardTitle}>{skr(arena.held)} SKR</Text>
            <Text style={styles.cardBody}>{shortAddress(address)}</Text>
          </Card>

          <Card>
            <Text style={styles.cardTitle}>{arena.isHolder ? 'Holder perks — active' : 'Holder perks'}</Text>
            <Text style={styles.cardBody}>
              Hold {skr(HOLDER_THRESHOLD)} SKR and every entry costs 20% less. The discount is
              enforced by the program, reading your own balance — not by this app.
            </Text>
            {!arena.isHolder ? (
              <Text style={styles.cardBody}>{skr(toHolder)} SKR to go.</Text>
            ) : (
              <Text style={styles.perkOn}>Entry {skr(arena.fee)} SKR instead of 5</Text>
            )}
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Today</Text>
            <Text style={styles.cardBody}>
              {arena.mine ? `Entered · ${arena.mine.data.votes} votes` : 'Not entered yet'}
              {'\n'}
              {arena.voted ? 'Voted' : 'No vote cast'}
            </Text>
          </Card>
        </View>
      }
    />
  );
}

// ── bits ───────────────────────────────────────────────────────────────────

const Card = ({ children }: { children: React.ReactNode }) => <View style={styles.card}>{children}</View>;

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const Loading = () => (
  <View style={styles.center}>
    <ActivityIndicator color={colors.flameSoft} />
  </View>
);

const Empty = ({ text }: { text: string }) => (
  <View style={styles.center}>
    <Text style={styles.empty}>{text}</Text>
  </View>
);

const Connect = ({ onConnect, connecting }: { onConnect: () => Promise<void>; connecting: boolean }) => (
  <Pressable onPress={() => void onConnect()} disabled={connecting} style={styles.connect}>
    <Text style={styles.connectText}>{connecting ? 'Opening wallet…' : 'Connect wallet'}</Text>
  </Pressable>
);

function Action({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={busy || disabled} style={[styles.action, (busy || disabled) && styles.actionOff]}>
      {busy ? <ActivityIndicator color={colors.ink} size="small" /> : <Text style={styles.actionText}>{label}</Text>}
    </Pressable>
  );
}

/** Time left, ticking once a minute — a per-second countdown is a per-second re-render. */
function useCountdown(endsAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return '—';
  const ms = endsAt * 1000 - now;
  if (ms <= 0) return 'closed';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  sub: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  close: { paddingHorizontal: space(3), paddingVertical: space(2) },
  closeText: { color: colors.flameSoft, fontSize: 15, fontWeight: '600' },

  tabs: { flexDirection: 'row', gap: space(2), paddingHorizontal: space(4), paddingBottom: space(3) },
  tab: { paddingHorizontal: space(3), paddingVertical: space(2), borderRadius: radius.pill, backgroundColor: colors.surface },
  tabOn: { backgroundColor: colors.flame },
  tabText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  tabTextOn: { color: colors.ink },

  body: { padding: space(3), paddingBottom: space(10), gap: space(3) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6) },

  themeCard: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    marginBottom: space(3),
  },
  themeLabel: { color: colors.flameSoft, fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  theme: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: space(2) },
  themeRow: { flexDirection: 'row', gap: space(6), marginTop: space(4) },
  statLabel: { color: colors.textFaint, fontSize: 11 },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 2 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderFaint,
    padding: space(4),
    marginBottom: space(3),
    gap: space(2),
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardBody: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  perkOn: { color: colors.green, fontSize: 13, fontWeight: '600' },
  myImage: { width: '100%', aspectRatio: 1, borderRadius: radius.md, marginTop: space(2) },

  pick: { width: 84, height: 84, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  pickOn: { borderColor: colors.flame },

  action: {
    backgroundColor: colors.flame,
    borderRadius: radius.pill,
    paddingVertical: space(3),
    alignItems: 'center',
    marginTop: space(2),
  },
  actionOff: { opacity: 0.45 },
  actionText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  connect: { alignItems: 'center', paddingVertical: space(2) },
  connectText: { color: colors.flameSoft, fontSize: 13, fontWeight: '600' },

  entry: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space(3),
    borderWidth: 1,
    borderColor: colors.borderFaint,
  },
  entryFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space(2) },
  entryVotes: { color: colors.text, fontSize: 12, fontWeight: '600' },
  entryWho: { color: colors.textFaint, fontSize: 11, marginTop: 1 },
  voteBtn: { backgroundColor: colors.flame, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1) },
  voteText: { color: colors.ink, fontSize: 12, fontWeight: '700' },

  empty: { color: colors.textFaint, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  fine: { color: colors.textGhost, fontSize: 11, lineHeight: 17, paddingHorizontal: space(1) },

  error: {
    marginHorizontal: space(3),
    marginBottom: space(2),
    padding: space(3),
    borderRadius: radius.md,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
  },
  errorText: { color: colors.red, fontSize: 13 },
  errorHint: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
});
