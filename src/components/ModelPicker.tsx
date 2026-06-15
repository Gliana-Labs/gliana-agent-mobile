/**
 * Fullscreen model picker with search — the mobile take on the web proposal
 * card's inline <select>. Lists every gateway model in the proposal's category
 * (the gateway validates required inputs before charging, so any pick is safe),
 * cheapest first, filterable by id/provider.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchModels, usd, type ModelRow } from '../lib/api';
import { colors, radius, space } from '../theme';

export function ModelPicker({
  visible,
  category,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  category: string;
  current: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!visible || models.length) return;
    setLoading(true);
    fetchModels()
      .then(setModels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, models.length]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return models
      .filter((m) => m.category === category)
      .filter((m) => !needle || m.id.toLowerCase().includes(needle) || m.provider.toLowerCase().includes(needle))
      .sort((a, b) => a.unitPriceMicroUsd - b.unitPriceMicroUsd);
  }, [models, category, q]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + space(2) }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Choose a model</Text>
            <Text style={styles.subtitle}>{category}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            value={q}
            onChangeText={setQ}
            placeholder="Search models…"
            placeholderTextColor={colors.textGhost}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: space(10) }} color={colors.flameSoft} />
        ) : (
          <FlatList
            data={list}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: space(3), paddingBottom: insets.bottom + space(4) }}
            renderItem={({ item }) => {
              const active = item.id === current;
              return (
                <Pressable
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowId} numberOfLines={1}>{item.id}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.provider} · {item.priceLabel ?? `${usd(item.unitPriceMicroUsd)}/${item.unit}`}
                    </Text>
                  </View>
                  {active && <Text style={styles.check}>✓</Text>}
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>No models match.</Text>}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(4),
    paddingBottom: space(3),
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  subtitle: { color: colors.textFaint, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  done: { color: colors.flameSoft, fontSize: 15, fontWeight: '600' },
  searchWrap: { paddingHorizontal: space(4), paddingBottom: space(3) },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space(3.5),
    marginBottom: space(2),
  },
  rowActive: { borderColor: colors.flame, backgroundColor: 'rgba(245,158,11,0.10)' },
  rowId: { color: colors.text, fontSize: 14, fontWeight: '600', fontFamily: 'monospace' },
  rowMeta: { color: colors.textFaint, fontSize: 12, marginTop: 3 },
  check: { color: colors.flameSoft, fontSize: 16, fontWeight: '700' },
  empty: { color: colors.textGhost, fontSize: 14, textAlign: 'center', marginTop: space(8) },
});
