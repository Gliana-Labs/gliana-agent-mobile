import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, space } from '../theme';
import { SendIcon } from './icons';

export function Composer({
  onSend,
  disabled,
  prefill,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  /**
   * Text dropped into the box for the person to finish, with a nonce so the
   * SAME text can be sent in again — picking the same quest twice has to work.
   */
  prefill?: { text: string; n: number };
}) {
  const [text, setText] = useState('');
  const ref = useRef<TextInput>(null);
  const seen = useRef(0);

  useEffect(() => {
    if (!prefill || prefill.n === seen.current) return;
    seen.current = prefill.n;
    setText(prefill.text);
    // Focus, or the prompt sits there looking like a message that was already
    // sent. The caret lands at the end, which is where the sentence is unfinished.
    requestAnimationFrame(() => ref.current?.focus());
  }, [prefill]);
  const canSend = text.trim().length > 0 && !disabled;

  function submit() {
    const t = text.trim();
    if (!t || disabled) return;
    setText('');
    onSend(t);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <TextInput
          ref={ref}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Describe what to make…"
          placeholderTextColor={colors.textGhost}
          multiline
          onSubmitEditing={submit}
          blurOnSubmit={false}
        />
        <Pressable
          onPress={submit}
          disabled={!canSend}
          style={[styles.send, canSend ? styles.sendActive : styles.sendIdle]}
        >
          <SendIcon size={16} color={canSend ? '#0a0a0d' : colors.textGhost} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space(3), paddingTop: space(2), paddingBottom: space(3) },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space(2),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingLeft: space(4),
    paddingRight: space(2),
    paddingVertical: space(2),
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    maxHeight: 120,
    paddingTop: space(1),
    paddingBottom: space(1),
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendActive: { backgroundColor: colors.flameSoft },
  sendIdle: { backgroundColor: colors.surfaceStrong },
});
