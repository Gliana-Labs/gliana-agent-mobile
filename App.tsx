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
import Svg, { Path } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WalletProvider } from './src/lib/mwa';
import { agentChat, agentConfigured, agentDeleteConversation, usd } from './src/lib/api';
import { loadState, saveState } from './src/lib/storage';
import { colors, radius, space } from './src/theme';
import { Composer } from './src/components/Composer';
import { MessageBubble } from './src/components/MessageBubble';
import { Sidebar } from './src/components/Sidebar';
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
  { tag: 'Voice', model: 'tts-1', prompt: 'read a line aloud in a calm, warm voice', send: 'Use tts-1 to read aloud: Welcome to GlianaAI — pay per result, no signup.' },
  { tag: 'Music', model: 'music-2.6', prompt: 'a lo-fi track for a rainy night', send: 'Make a track with music-2.6: lo-fi beats for a rainy night' },
  { tag: 'Animate', model: 'grok-imagine-video-1.5-preview', prompt: 'animate an image into a short clip', send: 'Animate my image into a short video with grok-imagine-video-1.5-preview (image-to-video) — I will attach the image' },
  { tag: 'Edit video', model: 'aleph-2', prompt: 'restyle a clip to golden-hour', send: 'Edit my video with aleph-2 (video-to-video): make it a golden-hour sunset with warm lighting — I will attach the video' },
  { tag: 'Transcribe', model: 'gpt-4o-transcribe', prompt: 'transcribe an audio file to text', send: 'Transcribe my audio file with gpt-4o-transcribe (speech-to-text) — I will attach the audio' },
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
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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
          setSidebarOpen(false);
        }}
        onDelete={deleteChat}
      />

      <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => setSidebarOpen(true)} hitSlop={8} style={styles.menuBtn}>
            <MenuIcon size={20} color={colors.textDim} />
          </Pressable>
          {active && messages.length > 0 ? (
            <Text style={styles.headerTitle} numberOfLines={1}>
              {active.title}
            </Text>
          ) : (
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Agent online · pay per result</Text>
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
        {messages.length === 0 ? (
          <EmptyState onPick={send} />
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

        <View style={{ paddingBottom: insets.bottom }}>
          <Composer onSend={send} disabled={typing} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.empty} keyboardShouldPersistTaps="handled">
      <View style={styles.pill}>
        <View style={styles.pillDot} />
        <Text style={styles.pillText}>60+ models · one prompt</Text>
      </View>
      <Text style={styles.emptyTitle}>
        What should we <Text style={styles.emptyAccent}>make</Text>?
      </Text>
      <Text style={styles.emptySub}>
        Describe it. The agent picks the model, quotes the exact price, and you pay per result.
      </Text>
      <View style={styles.cards}>
        {SUGGESTIONS.map((s) => (
          <Pressable key={s.tag} style={styles.card} onPress={() => onPick(s.send)}>
            <View style={styles.cardHead}>
              <Svg width={14} height={14} viewBox="0 0 16 16" fill={colors.flameSoft}>
                <Path d={CAT_ICON[s.tag]} />
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
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
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
