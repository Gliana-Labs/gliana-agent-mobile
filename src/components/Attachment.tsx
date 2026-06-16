/**
 * File input for proposals that need one — image for image-to-video ("animate"),
 * audio for transcribe (stt). Mirrors the web card's attach box: pick a file OR
 * paste a URL. The value handed up is either a public URL or raw base64 (no data
 * prefix) — both accepted by the gateway for the model's file field.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { colors, radius, space } from '../theme';

export type AttachKind = 'image' | 'audio' | 'video';

// Base64 inflates ~4/3 and the gateway caps bodies ~1 MB.
const MAX_BYTES = 700_000;

function isUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//.test(v);
}

export function Attachment({
  kind,
  value,
  onChange,
  disabled,
}: {
  kind: AttachKind;
  value: unknown;
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
}) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const hasFile = typeof value === 'string' && value.length > 0 && !isUrl(value);

  async function pickImage() {
    setError('');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Allow photo access to attach an image.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if ((a.fileSize ?? 0) > MAX_BYTES) {
      setError('Image must be under ~700 KB — pick a smaller one.');
      return;
    }
    if (a.base64) onChange(a.base64);
  }

  async function pickFile() {
    setError('');
    const res = await DocumentPicker.getDocumentAsync({
      type: kind === 'video' ? 'video/*' : 'audio/*',
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if ((a.size ?? 0) > MAX_BYTES) {
      // Big media (esp. video) can't go inline — tell the user to paste a URL.
      setError(`Too big to upload inline (≤700 KB). Paste a ${kind} URL instead.`);
      return;
    }
    setReading(true);
    try {
      const b64 = await FileSystem.readAsStringAsync(a.uri, { encoding: 'base64' });
      onChange(b64);
    } catch {
      setError('Could not read that file — try another.');
    } finally {
      setReading(false);
    }
  }

  const pick = kind === 'image' ? pickImage : pickFile;
  const noun = kind === 'image' ? 'Image' : kind === 'video' ? 'Video' : 'File';
  const pickLabel = reading
    ? 'Reading…'
    : hasFile
      ? `${noun} attached ✓ — pick another`
      : kind === 'image'
        ? 'Attach an image (≤700 KB)'
        : kind === 'video'
          ? 'Pick a small video (≤700 KB) — or paste a URL below'
          : 'Attach the audio file to transcribe (≤700 KB)';

  return (
    <View style={{ gap: space(2) }}>
      <Pressable style={styles.drop} onPress={pick} disabled={disabled || reading}>
        {reading ? <ActivityIndicator size="small" color={colors.flameSoft} /> : null}
        <Text style={styles.dropText}>{pickLabel}</Text>
      </Pressable>

      <View style={styles.orRow}>
        <View style={styles.hr} />
        <Text style={styles.orText}>or paste a URL</Text>
        <View style={styles.hr} />
      </View>

      <TextInput
        style={styles.url}
        value={isUrl(value) ? value : ''}
        onChangeText={(t) => onChange(t.trim() || undefined)}
        placeholder="https://…"
        placeholderTextColor={colors.textGhost}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!disabled}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  drop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.md,
    paddingVertical: space(3),
    paddingHorizontal: space(3),
  },
  dropText: { color: colors.textDim, fontSize: 12.5, textAlign: 'center' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  hr: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { color: colors.textGhost, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  url: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
    fontSize: 14,
  },
  error: { color: colors.red, fontSize: 12 },
});
