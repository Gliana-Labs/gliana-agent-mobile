/**
 * The Arena — a daily contest played with SKR.
 *
 * Three views behind one modal: Today (yesterday's result, the theme, the pot,
 * your entry), Gallery (everyone's entries, one vote per wallet) and You (the
 * streak, perks, history).
 *
 * The generation itself is NOT here: you make something in the chat, paid for
 * in USDC exactly as before, and then choose to enter it. Entering after the
 * fact is the point — a model that fails never costs an entry fee.
 *
 * DESIGN RULES, so later edits do not drift:
 *  - Filled amber means an action that costs or wins money: Enter, Vote, Claim.
 *    Selection is surface, not colour; exits are textDim. Amber TEXT marks money.
 *  - Type is four tiers — display 40/800, title 17/700, value 15/600, body 13 —
 *    with hierarchy from weight and colour, never from another font size.
 *  - Nothing below 12px and nothing dimmer than textDim: textFaint measures
 *    4.1:1 on this background and textGhost 2.5:1, which is decoration, not text.
 *  - Numbers that change under the eye are tabular.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { colors, font, radius, space } from '../theme';
import { useArena, HOLDER_THRESHOLD, type Placing } from '../arena/useArena';
import { fetchStandings, shortAddress, type EntryWithAddress, type Standing } from '../arena/client';
import { CLUSTER, skr, kindFor, sourceFor, acceptsContentType, type ThemeKind } from '../arena/config';
import { EntryMedia } from './arena/EntryMedia';
import { EntryViewer } from './arena/EntryViewer';

/** Picker thumbnail edge, shared by the style and the media cell inside it. */
const PICK_SIZE = 84;

/** Cheap medium sniff for places too small to host a real player. */
const isPlayable = (uri: string) => /\.(mp3|m4a|wav|ogg|mp4|mov|webm)$/i.test(uri);
import { Chip, Pot, Press, Rank, ThemeCard, WinBanner, tapSelect, PIXEL, px } from './arena/bits';
import { isMuted, play, setMuted } from '../lib/sfx';
import type { GenerationResult } from '../types';

type Tab = 'today' | 'gallery' | 'board' | 'you';

export function Arena({
  visible,
  onClose,
  results,
  onSnap,
  onMake,
}: {
  visible: boolean;
  onClose: () => void;
  /** Finished generations from this device's chats — what you can enter. */
  results: GenerationResult[];
  /** Send the player to the camera — today's quest is a photo quest. */
  onSnap: () => void;
  /** Seed the chat composer — how a player with nothing to enter gets started. */
  onMake: (prompt: string) => void;
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
            <Text style={styles.navTitle}>Arena</Text>
            <Text style={styles.meta}>{CLUSTER === 'devnet' ? 'Devnet · test SKR' : 'Daily contest'}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        {/* Selection is surface, not colour — amber is reserved for money. */}
        <View style={styles.tabs}>
          {(['today', 'gallery', 'board', 'you'] as Tab[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => {
                void tapSelect();
                setTab(t);
              }}
              style={[styles.tab, tab === t && styles.tabOn]}
            >
              {/* One line, always: a fourth tab left the count wrapping under
                  the word, which read as a broken label rather than a badge. */}
              <Text numberOfLines={1} style={[styles.tabText, tab === t && styles.tabTextOn]}>
                {t === 'today' ? 'Today' : t === 'gallery' ? 'Vote' : t === 'board' ? 'Board' : 'You'}
                {t === 'gallery' && arena.entries.length > 0 ? ` ${arena.entries.length}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>

        {arena.error ? (
          <Pressable onPress={() => void arena.refresh()} style={styles.error}>
            <Text style={styles.errorText}>{arena.error}</Text>
            <Text style={styles.meta}>Tap to retry</Text>
          </Pressable>
        ) : null}

        {tab === 'today' ? (
          <Today
            arena={arena}
            results={results}
            onSnap={onSnap}
            connected={connected}
            onConnect={connect}
            connecting={connecting}
            onMake={(p) => {
              onClose();
              onMake(p);
            }}
          />
        ) : tab === 'gallery' ? (
          <Gallery
            arena={arena}
            me={account?.address ?? null}
            connected={connected}
            onConnect={connect}
          />
        ) : tab === 'board' ? (
          <Board me={account?.address ?? null} onGoToday={() => setTab('today')} />
        ) : (
          <You arena={arena} address={account?.address ?? null} onGoToday={() => setTab('today')} />
        )}
      </View>
    </Modal>
  );
}

// ── Today ──────────────────────────────────────────────────────────────────

function Today({
  arena,
  results,
  onSnap,
  connected,
  onConnect,
  connecting,
  onMake,
}: {
  arena: ReturnType<typeof useArena>;
  results: GenerationResult[];
  /** Send the player to the camera — today's quest is a photo quest. */
  onSnap: () => void;
  connected: boolean;
  onConnect: () => Promise<void>;
  connecting: boolean;
  onMake: (prompt: string) => void;
}) {
  const left = useCountdown(arena.endsAt);
  const source = arena.roundId !== null ? sourceFor(arena.roundId) : 'camera';
  // The "You're in" cell is full card width: a player needs a real size, not a
  // percentage, because the video and audio views measure in pixels.
  const myWidth = useWindowDimensions().width - space(6) - space(6);
  // The ROUND decides the medium. One medium per round, because a gallery that
  // mixes a silent thumbnail with a track asks the voter to compare two
  // different things, and votes are already the scarce resource here.
  const kind = arena.roundId !== null ? kindFor(arena.roundId) : 'image';
  /**
   * NEWEST FIRST. The image you are about to stake is almost always the one you
   * just made, and it was last in a horizontal scroller — so the obvious tap
   * landed on an older result. That is how a failed generation got staked into
   * a live round for 4 SKR, and the program writes `media_uri` once, so there
   * is no undo: the entry PDA is keyed by (round, entrant) and `enter` cannot
   * be called twice.
   */
  const enterable = useMemo(
    () =>
      results
        // A camera round offers only what the camera produced. Without this the
        // quest said "photograph your floor" while the picker happily accepted
        // an image typed into the chat, which is a different contest.
        .filter(
          (r) =>
            Boolean(r.url) &&
            acceptsContentType(kind, r.contentType) &&
            (source !== 'camera' || r.fromCamera === true),
        )
        .slice()
        .reverse()
        .slice(0, 12),
    [results, kind, source],
  );
  const [picked, setPicked] = useState<string | null>(null);

  if (arena.loading) return <Loading />;

  const urgent = arena.endsAt !== null && arena.endsAt * 1000 - Date.now() < 3_600_000;

  return (
    <Scroll onRefresh={arena.refresh}>
      <Result arena={arena} />

      <ThemeCard theme={arena.theme}>
        <Pot amount={skr(arena.pot)} />
        <View style={styles.ends}>
          <Text style={styles.label}>ENDS IN</Text>
          <Text style={[styles.endsValue, styles.tnum, urgent && { color: colors.flame }]}>{left}</Text>
        </View>
      </ThemeCard>

      {!arena.roundOpen ? (
        <Card>
          <Text style={styles.title}>Nobody has opened today's round</Text>
          <Text style={styles.body}>
            Rounds are opened by whoever gets there first — there is no server. It costs a fraction
            of a cent in rent and gives you no advantage.
          </Text>
          <Action label="Open today's round" busy={arena.busy} disabled={!connected} onPress={() => void arena.open()} />
          {!connected ? <Connect onConnect={onConnect} connecting={connecting} /> : null}
        </Card>
      ) : arena.mine ? (
        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.title}>You're in</Text>
            <Chip text={`${arena.mine.data.votes} ${arena.mine.data.votes === 1 ? 'vote' : 'votes'}`} />
          </View>
          {/* Your entry, in whatever medium the round is. An <Image> here showed
              "image unavailable" over a perfectly good track. */}
          <View style={styles.myImage}>
            <EntryMedia kind={kind} uri={arena.mine.data.mediaUri} size={myWidth} />
          </View>
          <Text style={styles.body}>Paid {skr(arena.mine.data.paidFee)} SKR to enter.</Text>
        </Card>
      ) : enterable.length === 0 ? (
        // No disabled slab: the dead end becomes the loop. This seeds the chat
        // composer with today's theme — a text seed, not a charge.
        <Card>
          {/* An IMAGE round is a photo quest: you shoot the theme, then restyle
              the shot. It is the one thing a laptop cannot enter, and every
              entry starts from something the player actually saw — a better
              contest than who typed the better prompt. A video or music round
              has no camera step, so it leads with the composer instead. */}
          <Text style={styles.title}>
            {kind === 'video'
              ? "Film today's theme"
              : kind === 'music'
                ? "Score today's theme"
                : source === 'camera'
                  ? "Shoot today's theme"
                  : "Describe today's theme"}
          </Text>
          <Text style={styles.body}>
            {kind === 'image'
              ? source === 'camera'
                ? `Photograph something for “${arena.theme}”, pick a look, and it becomes your entry. Today is a camera round: only a photo you took can be entered.`
                : `No camera today — this one is won on the description alone. Write the best “${arena.theme}” you can.`
              : kind === 'video'
                ? `Describe a short clip for “${arena.theme}”.`
                : `Make a track for “${arena.theme}”. It plays as an eight-second preview in the gallery.`}
            {' '}You pay for it as normal, then enter for {skr(arena.fee)} SKR.
          </Text>
          {kind === 'image' && source === 'camera' ? (
            // No "describe it instead" here. It undercut the whole premise of
            // the round — the deck's claim that this beats a prompt contest is
            // only true if the round actually asks for a photograph. Prompt
            // contests are now their own rounds instead of a back door out of
            // this one.
            <Action label="Open the camera" busy={false} onPress={onSnap} />
          ) : (
            <>
              <Action
                label={kind === 'video' ? 'Describe the clip' : kind === 'music' ? 'Describe the track' : 'Describe it'}
                busy={false}
                onPress={() =>
                  onMake(
                    kind === 'video'
                      ? `Make a 5 second video: ${arena.theme}, `
                      : kind === 'music'
                        ? `Make a track: ${arena.theme}, `
                        : `Make an image: ${arena.theme}, `,
                  )
                }
              />

            </>
          )}
        </Card>
      ) : (
        <Card>
          <Text style={styles.title}>Enter today's round</Text>
          <Text style={styles.body}>
            Pick one of your {kind === 'image' ? 'images' : kind === 'video' ? 'clips' : 'tracks'}. Entry is {skr(arena.fee)} SKR
            {arena.isHolder ? ' — holder price, 20% off.' : '.'}
          </Text>
          <FlatList
            horizontal
            data={enterable}
            keyExtractor={(r) => r.url!}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space(2), paddingVertical: space(2) }}
            renderItem={({ item }) => (
              <Press
                haptic="none"
                onPress={() => {
                  void tapSelect();
                  setPicked(item.url!);
                }}
              >
                {/* A video or a track has no thumbnail, so the picker shows
                    the same cell the gallery will — you choose the thing the
                    voters will actually see or hear. */}
                <View style={[styles.pick, picked === item.url! && styles.pickOn, { overflow: 'hidden' }]}>
                  <EntryMedia kind={kind} uri={item.url!} size={PICK_SIZE} />
                </View>
              </Press>
            )}
          />
          <Action
            label={picked ? `Enter · ${skr(arena.fee)} SKR` : kind === 'image' ? 'Pick an image' : kind === 'video' ? 'Pick a clip' : 'Pick a track'}
            busy={arena.busy}
            disabled={!connected || !picked}
            onPress={() => picked && void arena.enter(picked).then(() => play('enter'), () => play('nope'))}
          />
          {!connected ? <Connect onConnect={onConnect} connecting={connecting} /> : null}
        </Card>
      )}

      <Split />
    </Scroll>
  );
}

/**
 * Yesterday, closing the loop.
 *
 * If you placed, this is the one moment that earns a spring, a shine and a
 * haptic — winning is rare, which is exactly what the delight budget is for.
 * If you didn't, it is one quiet line, no motion.
 */
function Result({ arena }: { arena: ReturnType<typeof useArena> }) {
  const y = arena.yesterday;
  if (!y || !y.winner) return null;
  const mine = y.mine;

  if (mine) {
    return (
      <WinBanner place={mine.place}>
        <Text style={styles.body}>
          "{y.theme}" · {mine.votes} {mine.votes === 1 ? 'vote' : 'votes'}
        </Text>
        {mine.claimable ? (
          <Action label="Claim your share" busy={arena.busy} onPress={() => void arena.claim(mine).then(() => play('win'), () => play('nope'))} />
        ) : (
          <Chip text="Claimed" tone="green" />
        )}
      </WinBanner>
    );
  }

  return (
    <View style={styles.yesterday}>
      {y.mediaUri ? (
        // 44px is too small for a player or a waveform, so a non-image winner
        // gets a glyph. A broken thumbnail is worse than no thumbnail.
        isPlayable(y.mediaUri) ? (
          <View style={[styles.thumb, styles.thumbGlyph]}>
            <Text style={styles.thumbGlyphText}>{y.mediaUri.endsWith('.mp3') ? '♪' : '▶'}</Text>
          </View>
        ) : (
          <Image source={{ uri: y.mediaUri }} style={styles.thumb} contentFit="cover" transition={160} />
        )
      ) : null}
      <Text style={[styles.meta, { flex: 1 }]} numberOfLines={2}>
        Yesterday · "{y.theme}" · won by {shortAddress(y.winner)} with {y.winnerVotes}{' '}
        {y.winnerVotes === 1 ? 'vote' : 'votes'}
      </Text>
    </View>
  );
}

/** How the pot splits, as a bar — the voters' share is the mechanic worth seeing. */
function Split() {
  return (
    <View style={styles.splitWrap}>
      <View style={styles.splitBar}>
        <View style={[styles.splitPart, { flex: 60, backgroundColor: colors.flame }]} />
        <View style={[styles.splitPart, { flex: 25, backgroundColor: 'rgba(245,158,11,0.55)' }]} />
        <View style={[styles.splitPart, { flex: 15, backgroundColor: 'rgba(245,158,11,0.3)' }]} />
      </View>
      <Text style={styles.meta}>Winner 60%  ·  Places 2–5 25%  ·  Early voters 15%</Text>
      <Text style={styles.meta}>Payouts are permissionless — anyone can push them through, including you.</Text>
    </View>
  );
}

// ── Gallery ────────────────────────────────────────────────────────────────

function Gallery({
  arena,
  me,
  connected,
  onConnect,
}: {
  arena: ReturnType<typeof useArena>;
  me: string | null;
  connected: boolean;
  onConnect: () => void;
}) {
  const { width } = useWindowDimensions();
  const kind = arena.roundId !== null ? kindFor(arena.roundId) : 'image';
  // Which entry is open full screen. You cannot judge a clip in a 180px tile,
  // and a vote you cannot inform is a vote nobody casts.
  const [open, setOpen] = useState<EntryWithAddress | null>(null);

  if (arena.loading) return <Loading />;
  if (arena.entries.length === 0)
    return <Empty text="No entries yet. Be the first — the early votes are worth the most." />;

  // One entry in a two-column grid is a card marooned beside a void.
  const single = arena.entries.length === 1;
  const col = single ? width - space(6) : (width - space(3) * 3) / 2;

  return (
    <FlatList
      data={arena.entries}
      numColumns={single ? 1 : 2}
      key={single ? 'one' : 'grid'}
      keyExtractor={(e) => e.address}
      contentContainerStyle={styles.list}
      columnWrapperStyle={single ? undefined : { gap: space(3) }}
      ListHeaderComponent={
        <Text style={[styles.meta, { marginBottom: space(3) }]}>
          One vote per wallet · {arena.voted ? 'yours is spent' : 'yours is unspent'}
        </Text>
      }
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void arena.refresh()} tintColor={colors.flame} />}
      ListFooterComponent={
        open ? (
          <EntryViewer
            visible
            kind={kind}
            uri={open.data.mediaUri}
            entrant={open.data.entrant}
            votes={open.data.votes}
            canVote={!arena.voted && open.data.entrant !== me}
            mine={open.data.entrant === me}
            busy={arena.busy}
            connected={connected}
            onVote={() => {
              if (!connected) {
                onConnect();
                return;
              }
              const e = open;
              setOpen(null);
              void arena.vote(e.address).then(() => play('vote'), () => play('nope'));
            }}
            onClose={() => setOpen(null)}
          />
        ) : null
      }
      renderItem={({ item, index }) => (
        <EntryCard
          entry={item}
          width={col}
          // A rank is meaningless in a field of one or two, and "#1 of 1" is
          // invented social proof.
          rank={arena.entries.length >= 3 && item.data.votes > 0 ? index + 1 : null}
          mine={item.data.entrant === me}
          kind={kind}
          onOpen={() => setOpen(item)}
          canVote={!arena.voted && item.data.entrant !== me}
          busy={arena.busy}
          connected={connected}
          onVote={() =>
            connected
              ? void arena.vote(item.address).then(() => play('vote'), () => play('nope'))
              : onConnect()
          }
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
  kind,
  onOpen,
  connected,
}: {
  entry: EntryWithAddress;
  width: number;
  rank: number | null;
  mine: boolean;
  canVote: boolean;
  busy: boolean;
  onVote: () => void;
  /** Without a wallet the button asks for one instead of pretending to vote. */
  connected: boolean;
  kind: ThemeKind;
  onOpen: () => void;
}) {
  return (
    <View style={[styles.entry, { width }, mine && styles.entryMine]}>
      {/* The whole tile opens it. The cells are posters now — nothing inside
          competes for the tap. */}
      <Press onPress={onOpen} haptic="none">
        <EntryMedia kind={kind} uri={entry.data.mediaUri} size={width} />
      </Press>
      {/* Stacked, not side by side: at half the screen width, pixel type and a
          44px button cannot share a row, and the button ended up sitting on top
          of the vote count. */}
      <View style={styles.entryFoot}>
        <View style={styles.entryMeta}>
          {rank ? <Rank place={rank} /> : null}
          <Text style={[styles.value, styles.tnum]} numberOfLines={1}>
            {entry.data.votes} {entry.data.votes === 1 ? 'vote' : 'votes'}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {mine ? 'yours' : shortAddress(entry.data.entrant)}
        </Text>
        {canVote ? (
          <Press onPress={onVote} disabled={busy} style={styles.voteBtn}>
            <Text style={styles.voteText}>{connected ? 'Vote' : 'Connect to vote'}</Text>
          </Press>
        ) : null}
      </View>
    </View>
  );
}

// ── You ────────────────────────────────────────────────────────────────────

function You({
  arena,
  address,
  onGoToday,
}: {
  arena: ReturnType<typeof useArena>;
  address: string | null;
  onGoToday: () => void;
}) {
  const claimable = useMemo(() => arena.history.placings.filter((p) => p.claimable), [arena.history]);
  if (!address) return <Empty text="Connect a wallet to see your streak, balance and perks." />;

  const progress = Math.min(1, Number(arena.held) / Number(HOLDER_THRESHOLD));

  return (
    <Scroll onRefresh={arena.refresh}>
      {/* The streak leads: it is the number that hurts to break. A balance of
          zero is the worst possible opening line for a new player. */}
      <Card>
        <Text style={styles.label}>DAY STREAK</Text>
        <Text style={[styles.display, styles.tnum]}>{arena.history.streak > 0 ? arena.history.streak : '—'}</Text>
        {arena.history.streak > 0 ? (
          <Text style={styles.meta}>
            Entered {arena.history.entered} · Won {arena.history.wins}
          </Text>
        ) : (
          <Press onPress={onGoToday} haptic="none" style={styles.linkRow}>
            <Text style={styles.link}>Enter today to start a streak →</Text>
          </Press>
        )}
        <View style={styles.chipRow}>
          <Chip text={arena.mine ? 'Entered' : 'Not entered'} tone={arena.mine ? 'green' : 'flame'} />
          <Chip text={arena.voted ? 'Voted' : 'No vote cast'} tone={arena.voted ? 'green' : 'flame'} />
        </View>
        <Text style={[styles.meta, styles.hair]}>
          {skr(arena.held)} SKR · {shortAddress(address)} — counted from the chain, so a reinstall
          keeps your streak.
        </Text>
      </Card>

      {claimable.length > 0 ? (
        <Card>
          <Text style={styles.title}>Winnings to claim</Text>
          {claimable.map((p) => (
            <View key={`${p.roundId}`} style={styles.claimRow}>
              <View>
                <Text style={styles.value}>{p.place === 1 ? 'Winner' : `Place ${p.place}`}</Text>
                <Text style={styles.meta}>
                  {dayLabel(p.roundId)} · {p.votes} {p.votes === 1 ? 'vote' : 'votes'}
                </Text>
              </View>
              <Press onPress={() => void arena.claim(p).then(() => play('win'), () => play('nope'))} disabled={arena.busy} style={styles.voteBtn}>
                <Text style={styles.voteText}>Claim</Text>
              </Press>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.title}>{arena.isHolder ? 'Holder perks — active' : 'Holder perks'}</Text>
        <Text style={styles.body}>Hold 100 SKR → entries cost 20% less, enforced on-chain.</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={[styles.meta, styles.tnum]}>
          {skr(arena.held)} / {skr(HOLDER_THRESHOLD)} SKR
          {arena.isHolder ? ` · entry ${skr(arena.fee)} instead of 5` : ''}
        </Text>
      </Card>

      <SoundRow />
    </Scroll>
  );
}

/**
 * The mute switch lives in the profile, not a settings screen nobody opens.
 *
 * Local state mirrors the module's, because the preference is read once at
 * launch and a toggle has to repaint immediately — the sound itself is the
 * confirmation when turning it back ON, which is why the blip fires there and
 * not on the way off.
 */
function SoundRow() {
  const [muted, setLocal] = useState(isMuted());
  return (
    <Press
      haptic="none"
      onPress={() => {
        const next = !muted;
        setLocal(next);
        void setMuted(next);
        if (!next) play('tap');
      }}
      style={styles.soundRow}
    >
      <Text style={styles.body}>Sound</Text>
      <Text style={[styles.value, PIXEL, { fontSize: 10 }]}>{muted ? 'OFF' : 'ON'}</Text>
    </Press>
  );
}

// ── bits ───────────────────────────────────────────────────────────────────


// ── Board ──────────────────────────────────────────────────────────────────

/**
 * All-time standings, across every round that has ended.
 *
 * Deliberately NOT a live board. A round's `top` moves with every vote, so a
 * crown that changes while you watch reads as a bug rather than a contest;
 * only ended rounds are counted, and today's result lands when the day does.
 *
 * Your own row is pinned below the list when you are outside the top ten. A
 * leaderboard you cannot find yourself on is a wall of strangers.
 */
function Board({ me, onGoToday }: { me: string | null; onGoToday: () => void }) {
  const [rows, setRows] = useState<Standing[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setRows(await fetchStandings());
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (failed) return <Empty text="Could not read the board. Pull to retry." />;
  if (!rows) return <Empty text="Reading the chain…" />;
  if (rows.length === 0)
    return (
      <Scroll onRefresh={load}>
        <Card>
          <Text style={styles.title}>No round has ended yet</Text>
          <Text style={styles.meta}>
            The board fills in when the first round closes. Win one and you open it.
          </Text>
          <Press onPress={onGoToday} haptic="none" style={styles.linkRow}>
            <Text style={styles.link}>Enter today's round →</Text>
          </Press>
        </Card>
      </Scroll>
    );

  const top = rows.slice(0, 10);
  const myIndex = me ? rows.findIndex((r) => r.entrant === me) : -1;
  const meBelow = myIndex >= top.length ? rows[myIndex] : null;

  return (
    <Scroll onRefresh={load}>
      <Card>
        <Text style={styles.label}>ALL-TIME</Text>
        <Text style={styles.meta}>
          Counted from the chain across {rows.length} {rows.length === 1 ? 'player' : 'players'}. Wins first,
          then what those wins were worth. Winnings are the winner's 60% share of each pot.
        </Text>
      </Card>

      <Card>
        {top.map((r, i) => (
          <Row key={r.entrant} rank={i + 1} row={r} isMe={r.entrant === me} />
        ))}
      </Card>

      {meBelow ? (
        <Card>
          <Text style={styles.label}>YOU</Text>
          <Row rank={myIndex + 1} row={meBelow} isMe />
        </Card>
      ) : null}

      {me && myIndex < 0 ? (
        <Card>
          <Text style={styles.title}>You are not on the board</Text>
          <Text style={styles.meta}>A top-five finish in any round puts you here.</Text>
          <Press onPress={onGoToday} haptic="none" style={styles.linkRow}>
            <Text style={styles.link}>Enter today's round →</Text>
          </Press>
        </Card>
      ) : null}
    </Scroll>
  );
}

/** One standing. The medal is drawn for the first three and nowhere else. */
function Row({ rank, row, isMe }: { rank: number; row: Standing; isMe: boolean }) {
  const medal = rank === 1 ? '#fbbf24' : rank === 2 ? '#d4d4d8' : rank === 3 ? '#b45309' : null;
  return (
    <View style={[styles.boardRow, isMe && styles.boardRowMe]}>
      <Text style={[styles.boardRank, styles.tnum, medal ? { color: medal } : null]}>{rank}</Text>
      <View style={styles.boardWho}>
        <Text style={styles.value} numberOfLines={1}>
          {shortAddress(row.entrant)}
          {isMe ? '  you' : ''}
        </Text>
        <Text style={styles.meta}>
          {skr(row.won)} SKR won · {row.places} {row.places === 1 ? 'finish' : 'finishes'} · {row.votes}{' '}
          {row.votes === 1 ? 'vote' : 'votes'}
        </Text>
      </View>
      <View style={styles.boardWins}>
        <Text style={[styles.display, styles.tnum, styles.boardWinsNum]}>{row.wins}</Text>
        <Text style={styles.meta}>{row.wins === 1 ? 'win' : 'wins'}</Text>
      </View>
    </View>
  );
}

const Scroll = ({ children, onRefresh }: { children: React.ReactNode; onRefresh: () => Promise<void> }) => (
  <FlatList
    data={[]}
    renderItem={null}
    contentContainerStyle={styles.list}
    refreshControl={<RefreshControl refreshing={false} onRefresh={() => void onRefresh()} tintColor={colors.flame} />}
    ListHeaderComponent={<View>{children}</View>}
  />
);

const Card = ({ children }: { children: React.ReactNode }) => <View style={styles.card}>{children}</View>;

const Loading = () => (
  <View style={styles.center}>
    <ActivityIndicator color={colors.flameSoft} />
  </View>
);

const Empty = ({ text }: { text: string }) => (
  <View style={styles.center}>
    <Text style={[styles.body, { textAlign: 'center' }]}>{text}</Text>
  </View>
);

const Connect = ({ onConnect, connecting }: { onConnect: () => Promise<void>; connecting: boolean }) => (
  <Pressable onPress={() => void onConnect()} disabled={connecting} style={styles.linkRow}>
    <Text style={styles.link}>{connecting ? 'Opening wallet…' : 'Connect wallet'}</Text>
  </Pressable>
);

/** Filled amber = an action that costs or wins money. Disabled goes ghost, never dimmed-amber. */
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
  if (disabled) {
    return (
      <View style={[styles.action, styles.actionGhost]}>
        <Text style={[styles.actionText, { color: colors.textDim }]}>{label}</Text>
      </View>
    );
  }
  return (
    <Press onPress={onPress} disabled={busy} style={[styles.action, busy && { opacity: 0.6 }]}>
      {busy ? <ActivityIndicator color={colors.ink} size="small" /> : <Text style={styles.actionText}>{label}</Text>}
    </Press>
  );
}

/** "today", "yesterday", or the date — rounds are UTC days. */
function dayLabel(roundId: bigint): string {
  const today = BigInt(Math.floor(Date.now() / 86_400_000));
  if (roundId === today) return 'today';
  if (roundId === today - 1n) return 'yesterday';
  return new Date(Number(roundId) * 86_400_000).toISOString().slice(0, 10);
}

/** Time left, ticking once a minute — a per-second countdown is a per-second re-render. */
function useCountdown(endsAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    tick.current = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
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
  // The modal title is navigation, not content — it must not compete with the theme.
  navTitle: { color: colors.text, fontSize: 13, fontFamily: font.pixel },
  close: { paddingHorizontal: space(3), paddingVertical: space(2) },
  closeText: { color: colors.textDim, fontSize: 9, fontFamily: font.pixel },

  // Type tiers.
  display: { color: colors.text, fontSize: 34, fontFamily: font.pixel },
  title: { color: colors.text, fontSize: 12, fontFamily: font.pixel, lineHeight: 19 },
  body: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  label: { color: colors.textDim, fontSize: 8, fontFamily: font.pixel, letterSpacing: 1 },
  value: { color: colors.text, fontSize: 11, fontFamily: font.pixel },
  meta: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  tnum: { fontVariant: ['tabular-nums'] },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(2.5),
    borderTopWidth: 1,
    borderTopColor: colors.borderFaint,
  },
  // Your own row is tinted, not outlined: an outline competes with the medal.
  boardRowMe: { backgroundColor: colors.surfaceStrong, marginHorizontal: -space(3), paddingHorizontal: space(3) },
  boardRank: { width: 28, color: colors.textDim, fontSize: 15, fontFamily: font.pixel },
  boardWho: { flex: 1, minWidth: 0 },
  boardWins: { alignItems: 'flex-end', minWidth: 52 },
  boardWinsNum: { fontSize: 26 },
  link: { color: colors.flameSoft, fontSize: 9, fontFamily: font.pixel, lineHeight: 16 },
  linkRow: { alignSelf: 'flex-start', paddingVertical: space(2) },
  hair: { borderTopWidth: 1, borderTopColor: colors.borderFaint, paddingTop: space(2) },

  tabs: {
    flexDirection: 'row',
    gap: space(1),
    padding: space(1),
    marginHorizontal: space(4),
    marginBottom: space(3),
    backgroundColor: colors.surface,
    borderRadius: px.radius,
    borderWidth: px.border,
    borderColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: space(2.5), paddingHorizontal: space(0.5), borderRadius: 2, alignItems: 'center' },
  tabOn: { backgroundColor: colors.surfaceStrong },
  tabText: { color: colors.textDim, fontSize: 8, fontFamily: font.pixel },
  tabTextOn: { color: colors.text },

  list: { padding: space(3), paddingBottom: space(10) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipRow: { flexDirection: 'row', gap: space(2), marginTop: space(1) },
  ends: { marginLeft: 'auto', alignItems: 'flex-end' },
  endsValue: { color: colors.text, fontSize: 15, fontFamily: font.pixel, marginTop: space(2) },

  // One card spec: 16 radius, 16 padding, surface, hairline border.
  card: {
    backgroundColor: colors.surface,
    borderRadius: px.radius,
    borderWidth: px.border,
    borderColor: colors.border,
    padding: space(4),
    marginBottom: space(4),
    gap: space(2),
  },
  // Nested media: parent radius (16) − padding (16), floored at 8.
  myImage: { width: '100%', aspectRatio: 1, borderRadius: 2, marginTop: space(1), overflow: 'hidden' },
  expand: {
    position: 'absolute', top: space(2), right: space(2),
    width: 30, height: 30, borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  expandGlyph: { color: colors.text, fontSize: 15, lineHeight: 17 },
  thumbGlyph: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  thumbGlyphText: { color: colors.textDim, fontSize: 16 },

  pick: { width: PICK_SIZE, height: PICK_SIZE, borderRadius: 2, borderWidth: px.border, borderColor: colors.border },
  pickOn: { borderColor: colors.flame },

  yesterday: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    padding: space(3),
    marginBottom: space(4),
    borderRadius: px.radius,
    backgroundColor: colors.surface,
    borderWidth: px.border,
    borderColor: colors.border,
  },
  thumb: { width: 44, height: 44, borderRadius: 2 },
  thumbFail: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong },

  splitWrap: { gap: space(2), paddingHorizontal: space(1), marginTop: space(1) },
  splitBar: { flexDirection: 'row', height: 10, overflow: 'hidden', gap: 3 },
  splitPart: { height: 10 },

  action: {
    backgroundColor: colors.flame,
    borderRadius: px.radius,
    // The hard offset is the depth: an 8-bit frame buffer has no blur.
    borderBottomWidth: px.offset,
    borderBottomColor: colors.flameDeep,
    paddingVertical: space(3),
    alignItems: 'center',
    marginTop: space(2),
    minHeight: 48,
    justifyContent: 'center',
  },
  actionGhost: {
    backgroundColor: 'transparent',
    borderWidth: px.border,
    borderColor: colors.border,
    borderBottomColor: colors.border,
  },
  actionText: { color: colors.ink, fontSize: 11, fontFamily: font.pixel, letterSpacing: 0.5 },

  entry: {
    backgroundColor: colors.surface,
    borderRadius: px.radius,
    overflow: 'hidden',
    marginBottom: space(3),
    borderWidth: px.border,
    borderColor: colors.border,
  },
  entryMine: { borderColor: colors.flame },
  // Stacked, not a row: at half the screen width pixel type and a 44px button
  // cannot share a line, and the button ended up on top of the vote count.
  entryFoot: { padding: space(3), gap: space(2) },
  entryMeta: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  // 44 is the floor for the most-repeated action in the product.
  voteBtn: {
    backgroundColor: colors.flame,
    borderRadius: px.radius,
    borderBottomWidth: px.offset,
    borderBottomColor: colors.flameDeep,
    paddingVertical: space(3),
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteText: { color: colors.ink, fontSize: 9, fontFamily: font.pixel },

  claimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space(2),
    borderTopWidth: 1,
    borderTopColor: colors.borderFaint,
  },

  // A segmented meter, because a smooth bar is not a pixel idiom.
  track: { height: 10, borderRadius: 2, backgroundColor: colors.surfaceStrong, borderWidth: px.border, borderColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.flame },

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
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(5),
    paddingVertical: space(4),
  },
});
