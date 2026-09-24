import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts, PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import Svg, { Path } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WalletProvider } from './src/lib/mwa';
import { agentChat, agentConfigured, agentDeleteConversation, usd } from './src/lib/api';
import { loadState, saveState } from './src/lib/storage';
import { colors, font, radius, space } from './src/theme';
import { Composer } from './src/components/Composer';
import { MessageBubble } from './src/components/MessageBubble';
import { Sidebar } from './src/components/Sidebar';
import { Showcase } from './src/components/Showcase';
import { Arena } from './src/components/Arena';
import { MapBoard } from './src/components/MapBoard';
import { usePeek, timeLeft, type Peek } from './src/arena/usePeek';
import { ConnectWallet } from './src/components/ConnectWallet';
import { MenuIcon } from './src/components/icons';
import { Backdrop } from './src/components/Backdrop';
import type { Conversation, GenerationResult, Message, ProposalDraft } from './src/types';

const STUB_REPLY =
  'The agent is not live yet. Soon: I pick the right model for what you described, quote the exact price, and you approve it with one tap.';
const OFFLINE_REPLY = 'The agent is unreachable right now — give it a moment and try again.';

// Opener cards — identical to the web app: each names the best model for its
// type + a sample prompt. `send` names the model so the agent proposes exactly
// that; `prompt` is the human-readable line shown on the card.
const SUGGESTIONS = [
  { tag: 'Image', model: 'nano-banana-2', prompt: 'a paper crane, minimal logo style on cream', send: 'Create an image with nano-banana-2: a paper crane, minimal logo style on cream' },
  { tag: 'Video', model: 'seedance-2.0', prompt: 'a lighthouse in a storm, 5 seconds', send: 'Make a 5-second video with seedance-2.0: a lighthouse in a storm' },
  { tag: 'Voice', model: 'eleven-v3', prompt: 'read a line aloud in a calm, warm voice', send: 'Use eleven-v3 to read aloud: Welcome to GlianaAI — pay per result, no signup.' },
  { tag: 'Music', model: 'music-v2', prompt: 'a lo-fi track for a rainy night', send: 'Make a track with music-v2: lo-fi beats for a rainy night' },
  { tag: 'Animate', model: 'grok-imagine-video-1.5-preview', prompt: 'animate an image into a short clip', send: 'Animate my image into a short video with grok-imagine-video-1.5-preview (image-to-video) — I will attach the image' },
  { tag: 'Edit video', model: 'aleph-2', prompt: 'restyle a clip to golden-hour', send: 'Edit my video with aleph-2 (video-to-video): make it a golden-hour sunset with warm lighting — I will attach the video' },
  { tag: 'Transcribe', model: 'gpt-4o-transcribe', prompt: 'transcribe an audio file to text', send: 'Transcribe my audio file with gpt-4o-transcribe (speech-to-text) — I will attach the audio' },
  { tag: 'Brainrot', model: 'brainrot-video', prompt: 'a chaotic italian-brainrot video', send: 'Make a brainrot video — it dances and spins chaotically' },
  { tag: 'Scrape', model: 'scrape', prompt: 'a web page → clean markdown', send: 'Scrape https://example.com and give me the clean markdown' },
];

// Per-category glyphs (16×16, fill=currentColor) — same paths as the web cards.
const CAT_ICON: Record<string, string> = {
  Image: 'M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7Zm1.5 0v4.94l2.3-2.3a.75.75 0 0 1 1.06 0L9 9.28l1.4-1.4a.75.75 0 0 1 1.06 0l1.04 1.05V4.5h-9ZM6 6.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  Video: 'M3.5 3h9A1.5 1.5 0 0 1 14 4.5v7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7A1.5 1.5 0 0 1 3.5 3Zm3 2.75v4.5a.5.5 0 0 0 .77.42l3.5-2.25a.5.5 0 0 0 0-.84l-3.5-2.25a.5.5 0 0 0-.77.42Z',
  Voice: 'M8 1.5A2.25 2.25 0 0 0 5.75 3.75v3a2.25 2.25 0 0 0 4.5 0v-3A2.25 2.25 0 0 0 8 1.5ZM4 7a.75.75 0 0 1 .75.75 3.25 3.25 0 0 0 6.5 0 .75.75 0 0 1 1.5 0 4.75 4.75 0 0 1-4 4.69v1.31a.75.75 0 0 1-1.5 0v-1.31A4.75 4.75 0 0 1 3.25 7.75.75.75 0 0 1 4 7Z',
  Music: 'M12 2.5a.75.75 0 0 0-.93-.73l-5 1.25A.75.75 0 0 0 5.5 3.75v5.6A2.5 2.5 0 1 0 7 11.5V6.34l4-1v2.26A2.5 2.5 0 1 0 12.5 10V2.5Z',
  Animate: 'M8 1.5l1.2 3.3L12.5 6 9.2 7.2 8 10.5 6.8 7.2 3.5 6l3.3-1.2L8 1.5Zm4.5 8l.55 1.45L14.5 11.5l-1.45.55L12.5 13.5l-.55-1.45L10.5 11.5l1.45-.55L12.5 9.5Z',
  Transcribe: 'M3 4.25A.75.75 0 0 1 3.75 3.5h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 4.25Zm0 3.5A.75.75 0 0 1 3.75 7h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 7.75Zm.75 2.75a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Z',
  'Edit video': 'M2.5 12.4 9 5.9l1.6 1.6-6.5 6.5-1.6-1.6Zm9-9 .9 1 1 .35-1 .35-.35 1-.35-1-1-.35 1-.35.35-1ZM12 7l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4L10 9l1.4-.6L12 7Z',
};

export default function App() {
  // The arcade face for the Arena. Loaded, not awaited: the chat must not wait
  // on a font it does not use, and the Arena falls back to the system font for
  // the frame or two before it lands.
  useFonts({ PressStart2P_400Regular });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <WalletProvider>
          <Main />
        </WalletProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Main() {
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [typingId, setTypingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [arenaOpen, setArenaOpen] = useState(false);
  /**
   * The app lands on Home — two destinations, not a composer.
   *
   * The chat is still one tap away and a tapped suggestion goes straight into
   * it, so the cost is a tap for someone who came to generate, and the gain is
   * that the round (which is the reason to open the app tomorrow) is the first
   * thing anyone sees.
   */
  const [view, setView] = useState<'home' | 'chat'>('home');
  // The header pill earns its space by carrying today's deadline, not a label.
  const peek = usePeek();
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  /**
   * Every finished generation on this device, newest first — what the Arena
   * offers you to enter. Kept here because conversations live here; the Arena
   * never generates anything itself.
   */
  const finishedResults = useMemo(
    () =>
      conversations
        .flatMap((c) => c.messages.map((m) => m.result))
        .filter((r): r is GenerationResult => Boolean(r?.url))
        .reverse(),
    [conversations],
  );

  // Load persisted conversations on mount.
  useEffect(() => {
    loadState().then((s) => {
      setConversations(s.conversations);
      setActiveId(s.activeId);
      setHydrated(true);
    });
  }, []);

  // Persist after hydration so we never overwrite stored state with the empty
  // initial value during the first render.
  useEffect(() => {
    if (hydrated) void saveState({ conversations, activeId });
  }, [conversations, activeId, hydrated]);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);

  function newChat() {
    if (active && active.messages.length === 0) {
      setSidebarOpen(false);
      return;
    }
    const c: Conversation = { id: rid(), title: 'New chat', messages: [] };
    setConversations((all) => [c, ...all]);
    setActiveId(c.id);
    setSidebarOpen(false);
  }

  function deleteChat(id: string) {
    setConversations((all) => all.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
    void agentDeleteConversation(id);
  }

  async function send(text: string) {
    let id = activeId;
    if (!active) {
      id = rid();
      setConversations((all) => [{ id: id!, title: 'New chat', messages: [] }, ...all]);
      setActiveId(id);
    }
    const title = text.length > 44 ? `${text.slice(0, 44)}…` : text;
    setConversations((all) =>
      all.map((c) =>
        c.id === id
          ? {
              ...c,
              title: c.title === 'New chat' ? title : c.title,
              messages: [...c.messages, { id: rid(), role: 'user' as const, text }],
            }
          : c,
      ),
    );
    setTypingId(id);

    let agentMsg: Message;
    if (agentConfigured) {
      try {
        const turn = await agentChat(id!, text);
        agentMsg = { id: rid(), role: 'agent', text: turn.reply, proposal: turn.proposal };
      } catch {
        agentMsg = { id: rid(), role: 'agent', text: OFFLINE_REPLY };
      }
    } else {
      await new Promise((r) => setTimeout(r, 700));
      agentMsg = { id: rid(), role: 'agent', text: STUB_REPLY };
    }

    setConversations((all) => all.map((c) => (c.id === id ? { ...c, messages: [...c.messages, agentMsg] } : c)));
    setTypingId(null);
  }

  function addResult(conversationId: string, result: GenerationResult) {
    const msg: Message = {
      id: rid(),
      role: 'agent',
      text: `Done — ${usd(result.costMicroUsd)} settled. Here's your result:`,
      result,
    };
    setConversations((all) => all.map((c) => (c.id === conversationId ? { ...c, messages: [...c.messages, msg] } : c)));
  }

  function updateDraft(conversationId: string, messageId: string, patch: Partial<ProposalDraft>) {
    setConversations((all) =>
      all.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) => (m.id === messageId ? { ...m, draft: { ...m.draft, ...patch } } : m)),
            }
          : c,
      ),
    );
  }

  const messages = active?.messages ?? [];
  const typing = typingId !== null && typingId === activeId;

  return (
    <View style={styles.root}>
      <Backdrop />

      <Sidebar
        visible={sidebarOpen}
        conversations={conversations}
        activeId={activeId}
        onClose={() => setSidebarOpen(false)}
        onNew={newChat}
        onSelect={(id) => {
          setActiveId(id);
          setView('chat');
          setSidebarOpen(false);
        }}
        onDelete={deleteChat}
        onShowcase={() => {
          setSidebarOpen(false);
          setShowcaseOpen(true);
        }}
        onArena={() => {
          setSidebarOpen(false);
          setArenaOpen(true);
        }}
      />

      <Arena
        visible={arenaOpen}
        onClose={() => setArenaOpen(false)}
        results={finishedResults}
        onMake={(prompt) => void send(prompt)}
      />

      <Showcase
        visible={showcaseOpen}
        onClose={() => setShowcaseOpen(false)}
        onMake={(runId) => {
          setShowcaseOpen(false);
          void send(`Make something with ${runId} — I'll fill in the details`);
        }}
      />

      <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => (view === 'chat' ? setView('home') : setSidebarOpen(true))}
            hitSlop={8}
            style={styles.menuBtn}
          >
            {view === 'chat' ? (
              <Text style={styles.backIcon}>‹</Text>
            ) : (
              <MenuIcon size={20} color={colors.textDim} />
            )}
          </Pressable>
          <Pressable onPress={() => setArenaOpen(true)} hitSlop={8} style={styles.arenaBtn}>
            <Text style={styles.arenaText}>◈ {timeLeft(peek.endsAt) ?? 'Arena'}</Text>
          </Pressable>
          {view === 'chat' && active && messages.length > 0 ? (
            <Text style={styles.headerTitle} numberOfLines={1}>
              {active.title}
            </Text>
          ) : view === 'home' ? (
            // On Home the conversation title is not the subject — the app is.
            <Text style={styles.wordmark}>
              Gliana<Text style={styles.emptyAccent}>Agent</Text>
            </Text>
          ) : (
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              {/* Short, and allowed to shrink: with the Arena pill and Connect both in
                  the header, the old "Agent online · pay per result" ran under the
                  Connect button on a phone-width screen. */}
              <Text style={styles.statusText} numberOfLines={1}>
                Online
              </Text>
            </View>
          )}
        </View>
        <ConnectWallet />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        {view === 'home' ? (
          <Home
            onPick={send}
            peek={peek}
            onArena={() => setArenaOpen(true)}
            onShowcase={() => setShowcaseOpen(true)}
            conversations={conversations}
            onOpenChat={(id) => {
              setActiveId(id);
              setView('chat');
            }}
            onNewChat={() => {
              newChat();
              setView('chat');
            }}
          />
        ) : messages.length === 0 ? (
          <EmptyState onPick={send} peek={peek} onArena={() => setArenaOpen(true)} />
        ) : (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onApproved={(result) => addResult(active!.id, result)}
                onDraft={(patch) => updateDraft(active!.id, m.id, patch)}
                onEnterArena={() => setArenaOpen(true)}
              />
            ))}
            {typing && (
              <View style={styles.typing}>
                <ActivityIndicator size="small" color={colors.flameSoft} />
                <Text style={styles.typingText}>Thinking…</Text>
              </View>
            )}
          </ScrollView>
        )}

        {view === 'chat' ? (
          <View style={{ paddingBottom: insets.bottom }}>
            <Composer onSend={send} disabled={typing} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * The home screen doubles as the map: two destinations, then the openers.
 *
 * Deliberately NOT a title screen on every launch. A menu in front of the
 * composer is a tap between the user and the thing they opened the app for, and
 * returning to a conversation still lands straight in it. This only shows where
 * there is nothing to return to — which is exactly where a map helps.
 */
/**
 * Home — the first screen, and the map.
 *
 * Two destinations and nothing else above the fold: today's round, and making
 * something. Recent chats sit under them so returning to yesterday's work is
 * one tap, and the openers stay because "what can this even do" is the first
 * question a new player has.
 *
 * Pixel type appears ONLY on the Arena card here. The chat half of the app
 * stays a calm tool; the contrast is what makes the Arena feel like a place.
 */
function Home({
  onPick,
  peek,
  onArena,
  onShowcase,
  conversations,
  onOpenChat,
  onNewChat,
}: {
  onPick: (text: string) => void;
  peek: Peek;
  onArena: () => void;
  onShowcase: () => void;
  conversations: Conversation[];
  onOpenChat: (id: string) => void;
  onNewChat: () => void;
}) {
  const left = timeLeft(peek.endsAt);
  // An empty "New chat" is not somewhere to pick up from.
  const recent = conversations.filter((c) => c.messages.length > 0).slice(0, 3);

  return (
    <ScrollView contentContainerStyle={styles.home} keyboardShouldPersistTaps="handled">
      <Text style={styles.homeHi}>
        What should we <Text style={styles.emptyAccent}>make</Text>?
      </Text>
      <Text style={styles.emptySub}>
        Describe it and the agent picks the model, quotes the exact price, and you pay per result.
      </Text>

      <MapBoard
        nodes={[
          {
            id: 'studio',
            label: 'STUDIO',
            glyph: '✦',
            x: 0.17,
            y: 0.42,
            status: '100+ models',
            onPress: onNewChat,
          },
          {
            id: 'arena',
            label: 'ARENA',
            glyph: '◈',
            x: 0.47,
            y: 0.56,
            live: peek.open,
            status: peek.open ? `${left ?? 'closing'} · ${peek.entries} in` : 'no round yet',
            onPress: onArena,
          },
          {
            id: 'gallery',
            label: 'SHOWCASE',
            glyph: '▦',
            x: 0.77,
            y: 0.38,
            status: 'what others made',
            onPress: onShowcase,
          },
        ]}
      />

      <Text style={styles.theme} numberOfLines={2}>
        Today: {peek.theme}
      </Text>

      {recent.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>PICK UP WHERE YOU LEFT OFF</Text>
          {recent.map((c) => (
            <Pressable key={c.id} style={styles.recent} onPress={() => onOpenChat(c.id)}>
              <Text style={styles.recentText} numberOfLines={1}>
                {c.title}
              </Text>
            </Pressable>
          ))}
        </>
      ) : null}

      <Text style={styles.sectionLabel}>OR START FROM ONE OF THESE</Text>
      <View style={styles.cards}>
        {SUGGESTIONS.map((s) => (
          <Pressable key={s.tag} style={styles.card} onPress={() => onPick(s.send)}>
            <View style={styles.cardHead}>
              <Svg width={14} height={14} viewBox="0 0 16 16" fill={colors.flameSoft}>
                <Path d={CAT_ICON[s.tag] ?? CAT_ICON.Image} />
              </Svg>
              <Text style={styles.cardTag}>{s.tag}</Text>
            </View>
            <Text style={styles.cardPrompt}>{s.prompt}</Text>
            <Text style={styles.cardModel} numberOfLines={1}>
              {s.model}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function EmptyState({
  onPick,
  peek,
  onArena,
}: {
  onPick: (text: string) => void;
  peek: Peek;
  onArena: () => void;
}) {
  const left = timeLeft(peek.endsAt);
  return (
    <ScrollView contentContainerStyle={styles.empty} keyboardShouldPersistTaps="handled">
      <View style={styles.pill}>
        <View style={styles.pillDot} />
        <Text style={styles.pillText}>100+ models · one prompt</Text>
      </View>
      <Text style={styles.emptyTitle}>
        What should we <Text style={styles.emptyAccent}>make</Text>?
      </Text>
      <Text style={styles.emptySub}>
        Describe it. The agent picks the model, quotes the exact price, and you pay per result.
      </Text>

      {/* Destination one: today's round. Pixel type here and nowhere else in
          the chat — the Arena is a place you go, not a skin over everything. */}
      <Pressable style={styles.arenaCard} onPress={onArena}>
        <View style={styles.arenaCardHead}>
          <Text style={styles.arenaCardLabel}>◈  TODAY'S ARENA</Text>
          {left ? <Text style={styles.arenaCardClock}>{left}</Text> : null}
        </View>
        <Text style={styles.arenaCardTheme} numberOfLines={2}>
          {peek.theme}
        </Text>
        <Text style={styles.arenaCardMeta}>
          {peek.open
            ? `${peek.entries} ${peek.entries === 1 ? 'entry' : 'entries'} · enter yours with SKR`
            : 'No round open yet — open it and set the pace'}
        </Text>
      </Pressable>

      <Text style={styles.sectionLabel}>OR MAKE SOMETHING</Text>
      <View style={styles.cards}>
        {SUGGESTIONS.map((s) => (
          <Pressable key={s.tag} style={styles.card} onPress={() => onPick(s.send)}>
            <View style={styles.cardHead}>
              <Svg width={14} height={14} viewBox="0 0 16 16" fill={colors.flameSoft}>
                <Path d={CAT_ICON[s.tag] ?? CAT_ICON.Image} />
              </Svg>
              <Text style={styles.cardTag}>{s.tag}</Text>
            </View>
            <Text style={styles.cardPrompt}>{s.prompt}</Text>
            <Text style={styles.cardModel} numberOfLines={1}>{s.model}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const rid = () =>
  // crypto.randomUUID exists under react-native-get-random-values' env; fall back just in case.
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    paddingHorizontal: space(4),
    paddingBottom: space(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.borderFaint,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: space(3), flex: 1, minWidth: 0 },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.textDim, fontSize: 14, flex: 1 },
  arenaBtn: {
    paddingHorizontal: space(2.5),
    paddingVertical: space(1.5),
    borderRadius: radius.pill,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  arenaText: { color: colors.flameSoft, fontSize: 12, fontWeight: '700' },
  arenaCard: {
    width: '100%',
    marginTop: space(6),
    padding: space(4),
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(245,158,11,0.45)',
    backgroundColor: 'rgba(245,158,11,0.08)',
    gap: space(2),
  },
  arenaCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arenaCardLabel: { color: colors.flameSoft, fontSize: 8, fontFamily: font.pixel, letterSpacing: 1 },
  arenaCardClock: { color: colors.text, fontSize: 10, fontFamily: font.pixel },
  arenaCardTheme: { color: colors.text, fontSize: 14, fontFamily: font.pixel, lineHeight: 22 },
  arenaCardMeta: { color: colors.textDim, fontSize: 12 },
  home: { padding: space(5), paddingBottom: space(12) },
  homeHi: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  makeCard: {
    marginTop: space(3),
    padding: space(4),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: space(2),
  },
  makeTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  recent: {
    marginTop: space(2),
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderFaint,
  },
  recentText: { color: colors.textDim, fontSize: 14 },
  backIcon: { color: colors.textDim, fontSize: 30, lineHeight: 30, marginTop: -4 },
  wordmark: { color: colors.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  theme: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginBottom: space(2) },
  sectionLabel: {
    alignSelf: 'flex-start',
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: space(7),
    marginBottom: space(1),
  },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), flexShrink: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: colors.green },
  statusText: { color: colors.textFaint, fontSize: 12 },
  list: { padding: space(4), paddingBottom: space(6) },
  typing: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  typingText: { color: colors.textFaint, fontSize: 13 },
  empty: { flexGrow: 1, alignItems: 'center', paddingHorizontal: space(4), paddingTop: '12%', paddingBottom: space(6), gap: space(5) },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: radius.pill,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },
  pillDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: colors.flameSoft },
  pillText: { color: colors.textDim, fontSize: 11 },
  emptyTitle: { color: colors.text, fontSize: 32, fontWeight: '700', textAlign: 'center', letterSpacing: -0.5 },
  emptyAccent: { color: colors.flameSoft },
  emptySub: { color: colors.textFaint, fontSize: 14, textAlign: 'center', maxWidth: 340, lineHeight: 21 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2.5), width: '100%', maxWidth: 520, marginTop: space(2) },
  card: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 150,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space(4),
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  cardTag: { color: colors.flameSoft, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardPrompt: { color: colors.textDim, fontSize: 13.5, marginTop: space(2), lineHeight: 19 },
  cardModel: { color: colors.textGhost, fontSize: 10, fontFamily: 'monospace', marginTop: space(2.5) },
});
