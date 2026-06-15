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
import type { Conversation, GenerationResult, Message, ProposalDraft } from './src/types';

const STUB_REPLY =
  'The agent is not live yet. Soon: I pick the right model for what you described, quote the exact price, and you approve it with one tap.';
const OFFLINE_REPLY = 'The agent is unreachable right now — give it a moment and try again.';

const SUGGESTIONS = ['A cinematic city at night', 'Narrate this in a calm voice', 'Lo-fi beat to study to', 'A logo for a coffee brand'];

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <WalletProvider>
        <Main />
      </WalletProvider>
    </SafeAreaProvider>
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
      <View pointerEvents="none" style={styles.glow} />

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
      <Text style={styles.emptyTitle}>
        What should we <Text style={styles.emptyAccent}>make?</Text>
      </Text>
      <Text style={styles.emptySub}>59 models · one prompt · pay per result</Text>
      <View style={styles.suggest}>
        {SUGGESTIONS.map((s) => (
          <Pressable key={s} style={styles.suggestChip} onPress={() => onPick(s)}>
            <Text style={styles.suggestText}>{s}</Text>
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
  glow: {
    position: 'absolute',
    top: -160,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 360,
    backgroundColor: 'rgba(245,158,11,0.10)',
  },
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
  empty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space(6), gap: space(3) },
  emptyTitle: { color: colors.text, fontSize: 30, fontWeight: '700', textAlign: 'center' },
  emptyAccent: { color: colors.flameSoft },
  emptySub: { color: colors.textFaint, fontSize: 14 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), justifyContent: 'center', marginTop: space(4) },
  suggestChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: space(4),
    paddingVertical: space(2.5),
  },
  suggestText: { color: colors.textDim, fontSize: 13 },
});
