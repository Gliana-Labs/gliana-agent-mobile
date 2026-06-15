/**
 * Conversation history — a slide-in drawer (Modal). Mirrors the web Sidebar:
 * brand, "New chat", the list, per-row delete.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '../theme';
import { PlusIcon, TrashIcon } from './icons';
import type { Conversation } from '../types';

export function Sidebar({
  visible,
  conversations,
  activeId,
  onClose,
  onNew,
  onSelect,
  onDelete,
}: {
  visible: boolean;
  conversations: Conversation[];
  activeId: string | null;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.panel, { paddingTop: insets.top + space(4) }]}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>
            Gliana<Text style={styles.brandAccent}>Agent</Text>
          </Text>
        </View>

        <Pressable style={styles.newBtn} onPress={onNew}>
          <PlusIcon size={16} color={colors.text} />
          <Text style={styles.newText}>New chat</Text>
        </Pressable>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + space(4) }}>
          {conversations.length === 0 ? (
            <Text style={styles.empty}>No conversations yet.</Text>
          ) : (
            conversations.map((c) => {
              const active = c.id === activeId;
              return (
                <View key={c.id} style={[styles.row, active && styles.rowActive]}>
                  <Pressable style={styles.rowMain} onPress={() => onSelect(c.id)}>
                    <Text style={[styles.rowTitle, active && styles.rowTitleActive]} numberOfLines={1}>
                      {c.title}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.del} onPress={() => onDelete(c.id)} hitSlop={8}>
                    <TrashIcon size={15} color={colors.textGhost} />
                  </Pressable>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '82%',
    maxWidth: 340,
    backgroundColor: colors.ink2,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: space(3),
  },
  brandRow: { paddingHorizontal: space(2), marginBottom: space(4) },
  brand: { color: colors.text, fontSize: 18, fontWeight: '700' },
  brandAccent: { color: colors.flameSoft },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: space(3),
    paddingHorizontal: space(3),
    marginBottom: space(4),
  },
  newText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  empty: { color: colors.textGhost, fontSize: 13, paddingHorizontal: space(2), paddingTop: space(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    marginBottom: space(1),
  },
  rowActive: { backgroundColor: colors.surface, borderLeftWidth: 2, borderLeftColor: colors.flame },
  rowMain: { flex: 1, paddingVertical: space(3), paddingHorizontal: space(3) },
  rowTitle: { color: colors.textDim, fontSize: 14 },
  rowTitleActive: { color: colors.text },
  del: { padding: space(3) },
});
