/**
 * The style picker that follows the shutter.
 *
 * Deliberately AFTER the photo, not before: choosing a look while staring at
 * your own picture is a different (and much easier) decision than choosing one
 * in the abstract. It is also why the photo stays on screen behind the chips.
 *
 * Six styles, one tap, no text field. The prompt underneath is a paragraph of
 * instructions (see lib/snap.ts) but nobody has to read it — on a phone, the
 * fastest path from "I see something" to "I made something" is what decides
 * whether this gets used twice.
 */
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors, font, radius, space } from '../theme';
import { SNAP_STYLES, questStyle, type SnapStyle } from '../lib/snap';

export function SnapSheet({
  photo,
  busy,
  error,
  quest,
  onPick,
  onRetake,
  onClose,
}: {
  photo: string | null;
  busy: boolean;
  error: string | null;
  /** Today's arena theme, when there is an open round. First and widest chip. */
  quest?: string | null;
  onPick: (style: SnapStyle) => void;
  onRetake: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <Modal visible={Boolean(photo)} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>PICK A LOOK</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {photo ? <Image source={{ uri: photo }} style={styles.shot} contentFit="cover" /> : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {quest ? (
            // The quest leads, because it is the only look with a deadline and
            // the only one that can be entered for a prize.
            <Pressable
              disabled={busy}
              onPress={() => {
                setPicked('quest');
                onPick(questStyle(quest));
              }}
              style={[styles.chip, styles.quest, picked === 'quest' && styles.chipOn, busy && picked !== 'quest' && styles.chipMuted]}
            >
              <Text style={[styles.chipLabel, picked === 'quest' && styles.chipLabelOn]}>TODAY'S QUEST</Text>
              <Text style={styles.chipHint} numberOfLines={1}>
                {quest}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.grid}>
            {SNAP_STYLES.map((s) => {
              const active = picked === s.id;
              return (
                <Pressable
                  key={s.id}
                  disabled={busy}
                  onPress={() => {
                    setPicked(s.id);
                    onPick(s);
                  }}
                  style={[styles.chip, active && styles.chipOn, busy && !active && styles.chipMuted]}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{s.label}</Text>
                  <Text style={styles.chipHint}>{s.hint}</Text>
                </Pressable>
              );
            })}
          </View>

          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={colors.flameSoft} />
              {/* Naming the step matters: the upload is the slow part on a phone
                  connection, and "Working…" makes a 6-second wait feel broken. */}
              <Text style={styles.busyText}>Uploading your photo…</Text>
            </View>
          ) : (
            <Pressable onPress={onRetake} style={styles.retake} hitSlop={8}>
              <Text style={styles.retakeText}>↺ Retake</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.ink2,
    borderTopWidth: 2,
    borderColor: colors.flame,
    padding: space(5),
    paddingBottom: space(9),
    gap: space(4),
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 11, fontFamily: font.pixel, letterSpacing: 1 },
  close: { color: colors.textDim, fontSize: 18 },
  shot: { width: '100%', height: 160, borderRadius: radius.md, backgroundColor: colors.surface },
  error: { color: colors.red, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 4,
    paddingVertical: space(3),
    paddingHorizontal: space(3),
    minWidth: '31%',
    flexGrow: 1,
  },
  chipOn: { borderColor: colors.flame, backgroundColor: 'rgba(245,158,11,0.12)' },
  quest: { width: '100%', borderColor: 'rgba(245,158,11,0.45)' },
  chipMuted: { opacity: 0.4 },
  chipLabel: { color: colors.text, fontSize: 9, fontFamily: font.pixel },
  chipLabelOn: { color: colors.flameSoft },
  chipHint: { color: colors.textDim, fontSize: 11, marginTop: 4 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  busyText: { color: colors.textDim, fontSize: 12 },
  retake: { alignSelf: 'flex-start' },
  retakeText: { color: colors.flameSoft, fontSize: 12 },
});
