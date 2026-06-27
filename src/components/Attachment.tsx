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
  optional,
  multi,
}: {
  kind: AttachKind;
  value: unknown;
  onChange: (v: string | string[] | undefined) => void;
  disabled?: boolean;
  onBusy?: (busy: boolean) => void;
  optional?: boolean;
  // arrayRef field (images, reference_images) — collect MANY URLs, send as array.
  multi?: boolean;
}) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  // Multi keeps an array; single keeps one string.
  const list: string[] = Array.isArray(value) ? (value as string[]) : isUrl(value) ? [value] : [];
  const hasValue = typeof value === 'string' && value.length > 0;
  // Surface upload/read progress so the parent can disable pay while it runs.
  useEffect(() => {
    onBusy?.(reading);
  }, [reading, onBusy]);

  // Upload one picked file to R2 (POST /v1/media) → hosted URL.
  async function uploadOne(uri: string, mime: string): Promise<string | null> {
    const up = await FileSystem.uploadAsync(`${API}/v1/media`, uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'content-type': mime },
    });
    return up.status >= 200 && up.status < 300 ? (JSON.parse(up.body).url as string) : null;
  }

  // Upload picked file(s). No base64, so the cap is 40 MB per file. For a multi
  // field every pick appends to the array; single replaces the one value.
  async function uploadAssets(assets: { uri: string; mime: string }[]) {
    setReading(true);
    setError('');
    try {
      const urls = (await Promise.all(assets.map((a) => uploadOne(a.uri, a.mime)))).filter(
        (u): u is string => !!u,
      );
      if (!urls.length) throw new Error('upload failed');
      onChange(multi ? [...list, ...urls] : urls[0]);
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
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsMultipleSelection: !!multi,
    });
    if (res.canceled || !res.assets?.length) return;
    const picked = (multi ? res.assets : res.assets.slice(0, 1)).filter(
      (a) => (a.fileSize ?? 0) <= MAX_UPLOAD_BYTES,
    );
    if (!picked.length) {
      setError('Each image must be under 40 MB.');
      return;
    }
    await uploadAssets(picked.map((a) => ({ uri: a.uri, mime: a.mimeType || 'image/jpeg' })));
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
    await uploadAssets([{ uri: a.uri, mime: a.mimeType || (kind === 'video' ? 'video/mp4' : 'audio/mpeg') }]);
  }

  const pick = kind === 'image' ? pickImage : pickFile;
  const noun = kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'audio file';
  const article = kind === 'image' ? 'an' : 'a';
  const pickLabel = reading
    ? 'Uploading…'
    : multi
      ? list.length > 0
        ? `${list.length} ${noun}${list.length === 1 ? '' : 's'} added ✓ — add more`
        : optional
          ? `Optional: add reference ${noun}s (≤40 MB each)`
          : `Add reference ${noun}s (≤40 MB each)`
      : hasValue
        ? `${noun[0].toUpperCase()}${noun.slice(1)} attached ✓ — upload another`
        : optional
          ? `Optional: add a reference ${noun} (≤40 MB)`
          : `Upload ${article} ${noun} (≤40 MB)`;

  function addUrl() {
    const u = urlDraft.trim();
    if (!isUrl(u)) return;
    onChange(multi ? [...list, u] : u);
    setUrlDraft('');
  }

  return (
    <View style={{ gap: space(2) }}>
      {multi && list.length > 0 ? (
        <View style={styles.chips}>
          {list.map((u, i) => (
            <View key={`${u}-${i}`} style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={1}>
                {u.split('/').pop()}
              </Text>
              <Pressable
                hitSlop={8}
                disabled={disabled || reading}
                onPress={() => onChange(list.filter((_, j) => j !== i))}
              >
                <Text style={styles.chipX}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable style={styles.drop} onPress={pick} disabled={disabled || reading}>
        {reading ? <ActivityIndicator size="small" color={colors.flameSoft} /> : null}
        <Text style={styles.dropText}>{pickLabel}</Text>
      </Pressable>

      <View style={styles.orRow}>
        <View style={styles.hr} />
        <Text style={styles.orText}>or paste a URL</Text>
        <View style={styles.hr} />
      </View>

      {multi ? (
        <View style={styles.urlRow}>
          <TextInput
            style={[styles.url, { flex: 1 }]}
            value={urlDraft}
            onChangeText={setUrlDraft}
            onSubmitEditing={addUrl}
            placeholder="https://…/image.jpg"
            placeholderTextColor={colors.textGhost}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!disabled}
          />
          <Pressable style={styles.addBtn} onPress={addUrl} disabled={disabled || !isUrl(urlDraft.trim())}>
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      ) : (
        <TextInput
          style={styles.url}
          value={isUrl(value) ? value : ''}
          onChangeText={(t) => onChange(t.trim() || undefined)}
          placeholder={kind === 'video' ? 'https://…/video.mp4' : kind === 'audio' ? 'https://…/audio.mp3' : 'https://…/image.jpg'}
          placeholderTextColor={colors.textGhost}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!disabled}
        />
      )}

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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1.5) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: space(1),
    paddingHorizontal: space(2),
    maxWidth: '100%',
  },
  chipText: { color: colors.textDim, fontSize: 11.5, maxWidth: 140 },
  chipX: { color: colors.textGhost, fontSize: 12, paddingHorizontal: space(0.5) },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  addBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
  },
  addBtnText: { color: colors.textDim, fontSize: 14 },
});
