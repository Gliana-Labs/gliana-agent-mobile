/**
 * A priced generation the agent proposed. Lets the user edit the model's inputs
 * (schema-driven), keeps the displayed price honest by re-quoting on the
 * billing-relevant fields, and pays the gateway 402 with the connected Solana
 * wallet (MWA). Ports the core of the web app's proposal card.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchSchema, quote, usd, type ModelSchema, type Proposal, type Quote } from '../lib/api';
import { payAndRun } from '../lib/pay';
import { useWallet } from '../lib/mwa';
import { colors, radius, space } from '../theme';
import { SchemaFields } from './SchemaFields';
import { WalletIcon } from './icons';
import type { GenerationResult, ProposalDraft } from '../types';

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
  const [schema, setSchema] = useState<ModelSchema | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...proposal.input,
    ...(draft?.fields ?? {}),
  }));
  const [q, setQ] = useState<Quote>(proposal.quote);
  const [status, setStatus] = useState<'idle' | 'paying' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSchema(proposal.model)
      .then((s) => alive && setSchema(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [proposal.model]);

  // Re-quote when a billing-relevant field changes (text length / duration /
  // resolution tier) so the shown price equals what /v1/infer will charge.
  const reqRef = useRef(0);
  useEffect(() => {
    const id = ++reqRef.current;
    const params = {
      text: typeof values.text === 'string' ? values.text : undefined,
      duration: typeof values.duration === 'number' ? values.duration : undefined,
      resolution: typeof values.resolution === 'string' ? values.resolution : undefined,
    };
    if (!params.text && !params.duration && !params.resolution) return;
    const t = setTimeout(() => {
      quote(proposal.model, params)
        .then((next) => id === reqRef.current && setQ(next))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [proposal.model, values.text, values.duration, values.resolution]);

  function setField(key: string, value: unknown) {
    setValues((v) => {
      const next = { ...v, [key]: value };
      onDraft({ fields: next });
      return next;
    });
  }

  const body = useMemo(() => {
    const out: Record<string, unknown> = { model: proposal.model };
    for (const [k, v] of Object.entries(values)) {
      if (v !== undefined && v !== '') out[k] = v;
    }
    return out;
  }, [proposal.model, values]);

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
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.model} numberOfLines={1}>{proposal.model}</Text>
          <Text style={styles.cat}>{proposal.category}</Text>
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.price}>{usd(q.costMicroUsd)}</Text>
          <Text style={styles.priceUnit}>{q.units > 1 ? `${q.units} × ${q.unit}` : q.unit}</Text>
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

      <Pressable
        onPress={() => Linking.openURL(`https://ai.glianalabs.com/models/${proposal.model}`)}
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
          disabled={status === 'paying' || connecting}
          style={[styles.payBtn, styles.payActive, (status === 'paying' || connecting) && styles.payBusy]}
        >
          {status === 'paying' || connecting ? (
            <ActivityIndicator color="#0a0a0d" />
          ) : !account ? (
            <>
              <WalletIcon size={16} color="#0a0a0d" />
              <Text style={styles.payText}>Connect wallet to pay</Text>
            </>
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space(4),
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  model: { color: colors.text, fontSize: 15, fontWeight: '600', fontFamily: 'monospace' },
  cat: { color: colors.textFaint, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  priceBox: { alignItems: 'flex-end' },
  price: { color: colors.flameSoft, fontSize: 18, fontWeight: '700', fontFamily: 'monospace' },
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
