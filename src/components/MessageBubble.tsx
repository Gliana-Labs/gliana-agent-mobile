import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '../theme';
import { ProposalCard } from './ProposalCard';
import { MediaView } from './MediaView';
import type { GenerationResult, Message, ProposalDraft } from '../types';

export function MessageBubble({
  message,
  onApproved,
  onDraft,
  onEnterArena,
}: {
  message: Message;
  onApproved: (result: GenerationResult) => void;
  onDraft: (patch: Partial<ProposalDraft>) => void;
  /** Offered on a finished image: the shortest path from a result into the round. */
  onEnterArena?: () => void;
}) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.text}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.agentRow}>
      {message.text ? <Text style={styles.agentText}>{message.text}</Text> : null}
      {message.proposal && (
        <View style={{ marginTop: space(3) }}>
          <ProposalCard
            proposal={message.proposal}
            draft={message.draft}
            onDraft={onDraft}
            onApproved={onApproved}
          />
        </View>
      )}
      {message.result && (
        <View style={{ marginTop: space(3) }}>
          <MediaView result={message.result} />
          {/* The loop only closes if the result knows the Arena exists. An
              image you just made is exactly when entering it is one tap. */}
          {onEnterArena && (message.result.contentType ?? '').startsWith('image/') ? (
            <Pressable onPress={onEnterArena} style={styles.arenaCta} hitSlop={6}>
              <Text style={styles.arenaCtaText}>◈  Enter this in today's round</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end', marginBottom: space(4) },
  userBubble: {
    maxWidth: '86%',
    backgroundColor: colors.flameSoft,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  userText: { color: '#0a0a0d', fontSize: 15, lineHeight: 21 },
  arenaCta: {
    marginTop: space(2),
    alignSelf: 'flex-start',
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(245,158,11,0.45)',
    backgroundColor: 'rgba(245,158,11,0.10)',
  },
  arenaCtaText: { color: colors.flameSoft, fontSize: 12, fontWeight: '700' },
  agentRow: { marginBottom: space(5) },
  agentText: { color: colors.textDim, fontSize: 15, lineHeight: 22 },
});
