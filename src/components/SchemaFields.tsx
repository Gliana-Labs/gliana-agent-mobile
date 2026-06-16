/**
 * Renders editable input fields for a model, driven by the gateway's /v1/schema.
 * Controlled: parent owns `values` and gets `onChange(key, value)`. Mirrors the
 * web app's SchemaFields (text / number / enum / boolean), minus file uploads
 * (attachments are a follow-up on mobile).
 */
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { colors, radius, space } from '../theme';
import type { ModelSchema, PropSchema } from '../lib/api';

export function SchemaFields({
  schema,
  values,
  onChange,
}: {
  schema: ModelSchema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  // Show required fields first, then the rest, skipping file refs.
  const keys = Object.keys(schema.props).sort((a, b) => {
    const ra = schema.required.includes(a) ? 0 : 1;
    const rb = schema.required.includes(b) ? 0 : 1;
    return ra - rb;
  });

  return (
    <View style={{ gap: space(3) }}>
      {keys.map((key) => {
        const p = schema.props[key];
        if (p.fileRef) return null;
        return (
          <Field
            key={key}
            name={key}
            spec={p}
            required={schema.required.includes(key)}
            value={values[key]}
            onChange={(v) => onChange(key, v)}
          />
        );
      })}
    </View>
  );
}

function Field({
  name,
  spec,
  required,
  value,
  onChange,
}: {
  name: string;
  spec: PropSchema;
  required: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{name}</Text>
      {required && <Text style={styles.req}>required</Text>}
    </View>
  );

  // Enum → chip selector
  if (spec.enum && spec.enum.length > 0) {
    return (
      <View>
        {label}
        <View style={styles.chips}>
          {spec.enum.map((opt) => {
            const v = String(opt);
            const active = String(value ?? spec.default ?? '') === v;
            return (
              <Pressable
                key={v}
                onPress={() => onChange(opt)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{v}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  // Boolean → switch
  if (spec.type === 'boolean') {
    return (
      <View style={styles.boolRow}>
        {label}
        <Switch
          value={Boolean(value ?? spec.default ?? false)}
          onValueChange={onChange}
          trackColor={{ true: colors.flame, false: colors.surfaceStrong }}
          thumbColor={colors.text}
        />
      </View>
    );
  }

  const isNumber = spec.type === 'number' || spec.type === 'integer';
  // Duration has no schema max on some models, but the gateway clamps seconds to
  // 60 — mirror that so a typed value can't quote an uncharged number (parity
  // with the web card).
  const maxVal = spec.max ?? (name === 'duration' ? 60 : undefined);
  const range =
    isNumber && (spec.min !== undefined || maxVal !== undefined)
      ? `${spec.min ?? '–'} to ${maxVal ?? '–'}`
      : null;

  // Clamp a number field to [min, max] so a forged value (e.g. duration 9999 on a
  // model that maxes at 12) can't be entered or quoted.
  function commitNumber() {
    if (!isNumber || value === undefined || value === null || value === '') return;
    let n = Number(value);
    if (!Number.isFinite(n)) {
      onChange(undefined);
      return;
    }
    if (spec.min !== undefined && n < spec.min) n = spec.min;
    if (maxVal !== undefined && n > maxVal) n = maxVal;
    if (spec.type === 'integer') n = Math.round(n);
    if (n !== Number(value)) onChange(n);
  }

  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{name}</Text>
        {required && <Text style={styles.req}>required</Text>}
        {range && <Text style={styles.range}>{range}</Text>}
      </View>
      <TextInput
        style={[styles.input, name === 'prompt' || name === 'text' ? styles.inputMultiline : null]}
        value={value === undefined || value === null ? '' : String(value)}
        onChangeText={(t) => onChange(isNumber ? (t === '' ? undefined : Number(t)) : t)}
        onBlur={commitNumber}
        onEndEditing={commitNumber}
        placeholder={spec.description ?? (isNumber ? (range ?? '0') : `Enter ${name}`)}
        placeholderTextColor={colors.textGhost}
        keyboardType={isNumber ? 'numeric' : 'default'}
        maxLength={!isNumber && typeof spec.max === 'number' ? spec.max : undefined}
        multiline={name === 'prompt' || name === 'text'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(1.5) },
  label: { color: colors.textDim, fontSize: 13, fontFamily: 'monospace' },
  req: {
    color: colors.red,
    fontSize: 10,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
    backgroundColor: 'rgba(248,113,113,0.1)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  range: { color: colors.textGhost, fontSize: 10, fontFamily: 'monospace' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
    fontSize: 14,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.flame, backgroundColor: 'rgba(245,158,11,0.12)' },
  chipText: { color: colors.textDim, fontSize: 13 },
  chipTextActive: { color: colors.flameSoft, fontWeight: '600' },
  boolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
