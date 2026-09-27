/**
 * Renders editable input fields for a model, driven by the gateway's /v1/schema.
 * Controlled: parent owns `values` and gets `onChange(key, value)`.
 *
 * THE CARD IS A RECEIPT, NOT A CONTROL PANEL.
 *
 * Every field used to render expanded, so a krea-2 proposal was eight optional
 * sliders deep — "K2 Complexity slider (-100 to 100). 0 disables the slider
 * LoRA." and seven more — and the price and the Pay button sat three screens
 * below the fold. The person asked for a picture of a paper crane; they were
 * shown a provider's parameter dump.
 *
 * So: required fields are the card, and everything else lives behind one
 * disclosure that says how many there are and how many you have changed. The
 * defaults are good (the gateway fills them anyway), and a caller who wants
 * `intensity` will go looking for it.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { colors, radius, space } from '../theme';
import type { ModelSchema, PropSchema } from '../lib/api';

/** `aspect_ratio` -> `Aspect ratio`. The API's name is not a label. */
const labelFor = (name: string) => {
  const s = name.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function SchemaFields({
  schema,
  values,
  onChange,
}: {
  schema: ModelSchema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const [open, setOpen] = useState(false);

  const { required, optional } = useMemo(() => {
    const keep = (key: string) => {
      const p = schema.props[key];
      if (!p || p.fileRef) return false;
      // billing-only fields (e.g. video-editing duration) are measured from the
      // source video, not typed by the user — hide them.
      return !/billing only|not sent/i.test(p.description ?? '');
    };
    const keys = Object.keys(schema.props).filter(keep);
    return {
      required: keys.filter((k) => schema.required.includes(k)),
      optional: keys.filter((k) => !schema.required.includes(k)),
    };
  }, [schema]);

  // "2 changed" is the reason to open the drawer — it tells you the agent (or
  // you, earlier) put something in there that is not the default.
  const changed = optional.filter((k) => {
    const v = values[k];
    return v !== undefined && v !== '' && v !== schema.props[k]?.default;
  }).length;

  const field = (key: string) => (
    <Field
      key={key}
      name={key}
      spec={schema.props[key]}
      value={values[key]}
      onChange={(v) => onChange(key, v)}
    />
  );

  return (
    <View style={{ gap: space(3) }}>
      {required.map(field)}

      {optional.length > 0 ? (
        <View>
          {/* The caret rides IN the label. Pushed to the far right it was a
              stray amber speck with a screen's worth of gap before it. */}
          <Pressable onPress={() => setOpen((v) => !v)} style={styles.disclosure} hitSlop={8}>
            <Text style={styles.disclosureText}>
              {open ? 'Hide' : 'Show'} {optional.length} option{optional.length === 1 ? '' : 's'}
              {changed > 0 ? ` · ${changed} changed` : ''} {open ? '▴' : '▾'}
            </Text>
          </Pressable>
          {open ? <View style={styles.optionals}>{optional.map(field)}</View> : null}
        </View>
      ) : null}
    </View>
  );
}

function Field({
  name,
  spec,
  value,
  onChange,
}: {
  name: string;
  spec: PropSchema;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{labelFor(name)}</Text>
    </View>
  );
  // Persistent field description (the placeholder disappears once a value is
  // typed — mirror the web card and keep it visible below the input).
  const caption = spec.description ? (
    <Text style={styles.caption} numberOfLines={2}>
      {spec.description}
    </Text>
  ) : null;

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
        {caption}
      </View>
    );
  }

  // Boolean → switch
  if (spec.type === 'boolean') {
    return (
      <View>
        <View style={styles.boolRow}>
          {label}
          <Switch
            value={Boolean(value ?? spec.default ?? false)}
            onValueChange={onChange}
            trackColor={{ true: colors.flame, false: colors.surfaceStrong }}
            thumbColor={colors.text}
          />
        </View>
        {caption}
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
        <Text style={styles.label}>{labelFor(name)}</Text>
        {range && <Text style={styles.range}>{range}</Text>}
      </View>
      <TextInput
        style={[styles.input, name === 'prompt' || name === 'text' ? styles.inputMultiline : null]}
        value={value === undefined || value === null ? '' : String(value)}
        onChangeText={(t) => onChange(isNumber ? (t === '' ? undefined : Number(t)) : t)}
        onBlur={commitNumber}
        onEndEditing={commitNumber}
        placeholder={isNumber ? (range ?? '0') : `Enter ${name}`}
        placeholderTextColor={colors.textGhost}
        keyboardType={isNumber ? 'numeric' : 'default'}
        maxLength={!isNumber && typeof spec.max === 'number' ? spec.max : undefined}
        multiline={name === 'prompt' || name === 'text'}
      />
      {caption}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(1.5) },
  label: { color: colors.text, fontSize: 13, fontWeight: '600' },
  range: { color: colors.textGhost, fontSize: 10, fontFamily: 'monospace' },
  // Was textGhost, which on this surface is barely a colour. A caption nobody
  // can read is worse than no caption: it still takes the space.
  caption: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: space(1.5) },
  disclosure: { alignSelf: 'flex-start', paddingVertical: space(2) },
  disclosureText: { color: colors.flameSoft, fontSize: 12 },
  optionals: {
    gap: space(3),
    marginTop: space(2),
    paddingTop: space(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
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
