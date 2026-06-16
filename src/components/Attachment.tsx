/**
 * File input for proposals that need one — image for image-to-video ("animate"),
 * audio for transcribe (stt). Mirrors the web card's attach box: pick a file OR
 * paste a URL. The value handed up is either a public URL or raw base64 (no data
 * prefix) — both accepted by the gateway for the model's file field.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { API } from '../lib/api';
import { colors, radius, space } from '../theme';

export type AttachKind = 'image' | 'audio' | 'video';

// Every attachment streams to R2 via POST /v1/media (40 MB cap) — no inline base64.
const MAX_UPLOAD_BYTES = 40_000_000;

function isUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//.test(v);
}

export function Attachment({
  kind,
  value,
  onChange,
  disabled,
  onBusy,
}: {
  kind: AttachKind;
  value: unknown;
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const hasValue = typeof value === 'string' && value.length > 0;
  // Surface upload/read progress so the parent can disable pay while it runs.
  useEffect(() => {
    onBusy?.(reading);
  }, [reading, onBusy]);

  // Upload any picked file to R2 (POST /v1/media) → hosted URL. No base64, so the
  // cap is 40 MB for every kind (not the old ~700 KB inline-body limit).
  async function uploadAsset(uri: string, mime: string) {
    setReading(true);
    try {
      const up = await FileSystem.uploadAsync(`${API}/v1/media`, uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'content-type': mime },
      });
      const url = up.status >= 200 && up.status < 300 ? (JSON.parse(up.body).url as string) : null;
      if (!url) throw new Error('upload failed');
      onChange(url);
    } catch {
      setError('Upload failed — try a smaller file or paste a URL.');
    } finally {
      setReading(false);
    }
  }

  async function pickImage() {
    setError('');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Allow photo access to attach an image.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if ((a.fileSize ?? 0) > MAX_UPLOAD_BYTES) {
      setError('Image must be under 40 MB.');
      return;
    }
    await uploadAsset(a.uri, a.mimeType || 'image/jpeg');
  }

  async function pickFile() {
    setError('');
    const res = await DocumentPicker.getDocumentAsync({
      type: kind === 'video' ? 'video/*' : 'audio/*',
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if ((a.size ?? 0) > MAX_UPLOAD_BYTES) {
      setError('File must be under 40 MB — or paste a URL.');
      return;
    }
    await uploadAsset(a.uri, a.mimeType || (kind === 'video' ? 'video/mp4' : 'audio/mpeg'));
  }

  const pick = kind === 'image' ? pickImage : pickFile;
  const noun = kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'audio file';
  const article = kind === 'image' ? 'an' : 'a';
  const pickLabel = reading
    ? 'Uploading…'
    : hasValue
      ? `${noun[0].toUpperCase()}${noun.slice(1)} attached ✓ — upload another`
      : `Upload ${article} ${noun} (≤40 MB)`;

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
        placeholder={kind === 'video' ? 'https://…/video.mp4' : 'https://…'}
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
