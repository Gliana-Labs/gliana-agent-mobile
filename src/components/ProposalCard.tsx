/**
 * A priced generation the agent proposed. Lets the user edit the model's inputs
 * (schema-driven), keeps the displayed price honest by re-quoting on the
 * billing-relevant fields, and pays the gateway 402 with the connected Solana
 * wallet (MWA). Ports the core of the web app's proposal card.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer } from 'expo-video';
import { fetchSchema, quote, usd, type ModelSchema, type Proposal, type Quote } from '../lib/api';
import { payAndRun } from '../lib/pay';
import { useWallet } from '../lib/mwa';
import { colors, radius, space } from '../theme';
import { SchemaFields } from './SchemaFields';
import { WalletIcon } from './icons';
import { ModelPicker } from './ModelPicker';
import { Attachment, type AttachKind } from './Attachment';
import type { GenerationResult, ProposalDraft } from '../types';

/**
 * The file input a proposal needs — derived from the schema's `fileRef` field
 * (the gateway marks any URL/upload field fileRef). Keyed by the REAL field name
 * (video_uri / image / audio / …) with the kind inferred from the name, so video
 * editors (aleph-2) get a video attachment, not a hidden field. Falls back to the
 * agent's category/note hint when the schema isn't loaded yet.
 */
function attachFromSchema(
  schema: ModelSchema | null,
  category?: string,
): { kind: AttachKind; key: string; optional: boolean } | null {
  if (!schema) return null;
  const fileEntries = Object.entries(schema.props).filter(([, p]) => p.fileRef);
  if (!fileEntries.length) return null;
  const required = new Set(schema.required ?? []);
  // Prefer a REQUIRED file field (blocking); else the first optional one — shown
  // but non-blocking, so a text-to-image model that also accepts a reference
  // image offers it without demanding it.
  const reqEntry = fileEntries.find(([k]) => required.has(k));
  const entry = reqEntry ?? fileEntries[0];
  const optional = !reqEntry;
  const [key] = entry;
  const k = key.toLowerCase();
  // Kind from the field name, falling back to the category — an STT model's file
  // field is named `file`/`url` (no "audio" in it) but must take audio.
  const isAudio = /audio|speech|sound/.test(k) || category === 'stt' || category === 'music';
  const kind: AttachKind = /video/.test(k) ? 'video' : isAudio ? 'audio' : 'image';
  return { kind, key, optional };
}

export function ProposalCard({
  proposal,
  draft,
  onDraft,
  onApproved,
}: {
  proposal: Proposal;
  draft?: ProposalDraft;
  onDraft: (patch: Partial<ProposalDraft>) => void;
  onApproved: (result: GenerationResult) => void;
}) {
  const { account, connect, connecting, signer } = useWallet();
  const [model, setModel] = useState(draft?.model ?? proposal.model);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [schema, setSchema] = useState<ModelSchema | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...proposal.input,
    ...(draft?.fields ?? {}),
  }));
  const [q, setQ] = useState<Quote>(proposal.quote);
  const [pricing, setPricing] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false); // uploading/reading an attachment
  const [status, setStatus] = useState<'idle' | 'paying' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSchema(null);
    fetchSchema(model)
      .then((s) => {
        if (!alive) return;
        setSchema(s);
        // Seed the schema's defaults for any field the user hasn't set. Without
        // this, a tiered field like `resolution` SHOWS its default (e.g. 720p)
        // but isn't in `values`, so the quote omits it and the gateway prices the
        // HIGHEST tier — the price was wrong until you tapped the default again.
        setValues((prev) => {
          const next = { ...prev };
          for (const [k, p] of Object.entries(s.props)) {
            if (next[k] === undefined && p.default !== undefined) next[k] = p.default;
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [model]);

  // Re-quote when a billing-relevant field changes (text length / duration /
  // resolution tier) so the shown price equals what /v1/infer will charge.
  const reqRef = useRef(0);
  useEffect(() => {
    const id = ++reqRef.current;
    // Duration can be a number, a numeric string ("8"), a suffixed enum ("8s"),
    // or a dropdown value — parseFloat reads the leading number from any of them.
    // Plain `typeof === 'number'` dropped string/enum durations from the quote, so
    // picking a duration never moved the price (the bug). Mirror the web's parse.
    const durationNum = parseFloat(String(values.duration));
    const params = {
      text: typeof values.text === 'string' ? values.text : undefined,
      duration: Number.isFinite(durationNum) && durationNum > 0 ? durationNum : undefined,
      resolution:
        values.resolution !== undefined && values.resolution !== '' ? String(values.resolution) : undefined,
    };
    setPricing(true);
    const t = setTimeout(() => {
      quote(model, params)
        .then((next) => {
          if (id === reqRef.current) {
            setQ(next);
            setPricing(false);
          }
        })
        .catch(() => id === reqRef.current && setPricing(false));
    }, 250);
    return () => clearTimeout(t);
  }, [model, values.text, values.duration, values.resolution]);

  function setField(key: string, value: unknown) {
    // Compute next from current values, then update both states OUTSIDE the
    // setValues updater. Calling onDraft (a parent setState) inside the updater
    // runs it during ProposalCard's render → "Cannot update a component (Main)
    // while rendering ProposalCard".
    const next = { ...values, [key]: value };
    setValues(next);
    onDraft({ fields: next });
  }

  // Switch model (from the picker): re-seed inputs (the agent's input only fits
  // its own model) and re-fetch schema + price via the effects above.
  function onSelectModel(id: string) {
    if (id === model) return;
    setModel(id);
    const reset = id === proposal.model ? { ...proposal.input } : {};
    setValues(reset);
    setStatus('idle');
    setError(null);
    onDraft({ model: id, fields: reset });
  }

  const body = useMemo(() => {
    const out: Record<string, unknown> = { model };
    for (const [k, v] of Object.entries(values)) {
      if (v !== undefined && v !== '') out[k] = v;
    }
    return out;
  }, [model, values]);

  // File this proposal needs — derived from the schema's fileRef field.
  const attach = useMemo(() => attachFromSchema(schema, proposal.category), [schema, proposal.category]);

  // Billing-only duration (video editing) is measured from the source video, not
  // typed — find that field + a usable video URL to probe.
  const billingDurKey = useMemo(
    () => (schema ? Object.entries(schema.props).find(([, p]) => /billing only|not sent/i.test(p.description ?? ''))?.[0] : undefined),
    [schema],
  );
  const probeUri =
    attach?.kind === 'video' && typeof values[attach.key] === 'string' && /^https?:/.test(values[attach.key] as string)
      ? (values[attach.key] as string)
      : null;
  // Only a REQUIRED attach blocks pay — an optional reference image never does.
  const attachMissing =
    attach != null && !attach.optional && (values[attach.key] === undefined || values[attach.key] === '');

  // Required fields with no value block pay (same as the web card) — avoids a
  // charge that would 400 server-side. File fields are handled by the attach box.
  const missing = useMemo(
    () =>
      (schema?.required ?? []).filter((k) => {
        const p = schema?.props[k];
        if (!p || p.fileRef || k === attach?.key) return false;
        const v = values[k];
        return v === undefined || v === '';
      }),
    [schema, values, attach],
  );

  async function pay() {
    if (!signer) {
      await connect().catch((e) => setError(humanError(e)));
      return;
    }
    setStatus('paying');
    setError(null);
    try {
      const res = await payAndRun(signer, body);
      const media = asResult(res);
      setStatus('done');
      onApproved(media);
    } catch (e) {
      setStatus('error');
      setError(humanError(e));
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Pressable
          style={{ flex: 1, minWidth: 0 }}
          onPress={() => setPickerOpen(true)}
          disabled={status === 'paying' || status === 'done'}
        >
          <Text style={styles.cat}>{proposal.category}</Text>
          <View style={styles.modelRow}>
            <Text style={styles.model} numberOfLines={1}>{model}</Text>
            <Text style={styles.chevron}>▾</Text>
          </View>
          <Text style={styles.changeHint}>tap to change</Text>
        </Pressable>
        <View style={styles.priceBox}>
          <Text style={[styles.price, pricing && styles.priceStale]}>{usd(q.costMicroUsd)}</Text>
          <Text style={styles.priceUnit}>
            {pricing ? 'updating…' : q.units > 1 ? `${q.units} × ${q.unit}` : q.unit}
          </Text>
        </View>
      </View>

      {schema ? (
        <View style={{ marginTop: space(4) }}>
          <SchemaFields schema={schema} values={values} onChange={setField} />
        </View>
      ) : (
        <View style={{ marginTop: space(4) }}>
          <ActivityIndicator color={colors.flameSoft} />
        </View>
      )}

      {attach && (
        <View style={{ marginTop: space(4) }}>
          <Attachment
            kind={attach.kind}
            value={values[attach.key]}
            onChange={(v) => setField(attach.key, v)}
            disabled={status === 'paying' || status === 'done'}
            onBusy={setAttachBusy}
            optional={attach.optional}
          />
        </View>
      )}

      {billingDurKey && probeUri && (
        <VideoDurationProbe
          key={probeUri}
          uri={probeUri}
          max={schema?.props[billingDurKey]?.max ?? 60}
          onDuration={(s) => setField(billingDurKey, s)}
        />
      )}

      {q.units > 1 && (
        <Text style={styles.breakdown}>
          {q.units} {q.unit}
          {q.units === 1 ? '' : 's'} × {usd(q.unitPriceMicroUsd)}
        </Text>
      )}

      <Pressable
        onPress={() => Linking.openURL(`https://ai.glianalabs.com/models/${model}`)}
        style={styles.detailsLink}
      >
        <Text style={styles.detailsText}>View model details ↗</Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      {status === 'done' ? (
        <View style={[styles.payBtn, styles.payDone]}>
          <Text style={styles.payDoneText}>Generated ✓</Text>
        </View>
      ) : (
        <Pressable
          onPress={pay}
          disabled={
            status === 'paying' ||
            connecting ||
            pricing ||
            attachBusy ||
            (account != null && (missing.length > 0 || attachMissing))
          }
          style={[
            styles.payBtn,
            styles.payActive,
            (status === 'paying' ||
              connecting ||
              pricing ||
              attachBusy ||
              (account != null && (missing.length > 0 || attachMissing))) &&
              styles.payBusy,
          ]}
        >
          {status === 'paying' || connecting ? (
            <>
              <ActivityIndicator color="#0a0a0d" />
              <Text style={styles.payText}>{connecting ? 'Connecting wallet…' : 'Paying & generating…'}</Text>
            </>
          ) : attachBusy ? (
            <>
              <ActivityIndicator color="#0a0a0d" />
              <Text style={styles.payText}>Uploading…</Text>
            </>
          ) : pricing ? (
            <Text style={styles.payText}>Updating price…</Text>
          ) : !account ? (
            <>
              <WalletIcon size={16} color="#0a0a0d" />
              <Text style={styles.payText}>Connect wallet to pay</Text>
            </>
          ) : attachMissing ? (
            <Text style={styles.payText}>
              Attach {attach?.kind === 'audio' ? 'an audio file' : attach?.kind === 'video' ? 'a video' : 'an image'}
            </Text>
          ) : missing.length > 0 ? (
            <Text style={styles.payText}>Fill {missing.join(', ')}</Text>
          ) : (
            <Text style={styles.payText}>Pay {usd(q.costMicroUsd)} & generate</Text>
          )}
        </Pressable>
      )}

      {account && status !== 'done' && (
        <Text style={styles.payHint}>
          Paying from {account.address.slice(0, 4)}…{account.address.slice(-4)} · USDC on Solana
        </Text>
      )}

      <ModelPicker
        visible={pickerOpen}
        category={proposal.category}
        current={model}
        onSelect={onSelectModel}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

function asResult(res: { costMicroUsd: number; output: unknown }): GenerationResult {
  const o = res.output as Record<string, unknown> | null;
  if (o && typeof o === 'object' && typeof o.url === 'string') {
    return {
      costMicroUsd: res.costMicroUsd,
      url: o.url as string,
      contentType: typeof o.contentType === 'string' ? o.contentType : undefined,
    };
  }
  return { costMicroUsd: res.costMicroUsd, raw: res.output };
}

function humanError(e: unknown): string {
  if (e instanceof Error) {
    if (/No installed wallet|not found|no wallet/i.test(e.message)) {
      return 'No Solana wallet app found. Install Phantom, Solflare, or Backpack.';
    }
    return e.message;
  }
  return 'Something went wrong.';
}

/**
 * Headless: loads a video just to read its duration, then reports it once (for
 * billing-only duration on video-editing models). Renders nothing.
 */
function VideoDurationProbe({ uri, max, onDuration }: { uri: string; max: number; onDuration: (s: number) => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
  });
  const done = useRef(false);
  useEffect(() => {
    const sub = player.addListener('statusChange', () => {
      if (!done.current && player.duration && player.duration > 0) {
        done.current = true;
        onDuration(Math.max(1, Math.min(Math.ceil(player.duration), max)));
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);
  return null;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space(4),
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  cat: { color: colors.flameSoft, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), marginTop: 3 },
  model: { color: colors.text, fontSize: 15, fontWeight: '600', fontFamily: 'monospace', flexShrink: 1 },
  chevron: { color: colors.textFaint, fontSize: 12 },
  changeHint: { color: colors.textGhost, fontSize: 10, marginTop: 2 },
  priceBox: { alignItems: 'flex-end' },
  price: { color: colors.flameSoft, fontSize: 18, fontWeight: '700', fontFamily: 'monospace' },
  priceStale: { opacity: 0.4 },
  breakdown: { color: colors.textFaint, fontSize: 12, marginTop: space(2) },
  priceUnit: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  detailsLink: { marginTop: space(3) },
  detailsText: { color: colors.textFaint, fontSize: 12 },
  error: { color: colors.red, fontSize: 13, marginTop: space(3), lineHeight: 18 },
  payBtn: {
    marginTop: space(4),
    height: 48,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
  },
  payActive: { backgroundColor: colors.flameSoft },
  payBusy: { opacity: 0.7 },
  payDone: { backgroundColor: 'rgba(52,211,153,0.15)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)' },
  payText: { color: '#0a0a0d', fontSize: 15, fontWeight: '700' },
  payDoneText: { color: colors.green, fontSize: 15, fontWeight: '700' },
  payHint: { color: colors.textGhost, fontSize: 11, textAlign: 'center', marginTop: space(2) },
});
