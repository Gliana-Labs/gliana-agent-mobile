/**
 * The Arena's moving parts.
 *
 * Motion here is rationed on purpose. The countdown changes once a minute and
 * gets none. Tabs are peers and get none. What earns it:
 *
 *  - press feedback, because a contest you tap at should feel physical
 *    (scale 0.97 in 120ms, a CSS transition on the UI thread — no re-render)
 *  - the moments you paid for: entering and voting get a haptic on commit
 *  - winning, which happens rarely enough to deserve the delight budget
 *
 * Haptics never travel alone: they are off system-wide for plenty of people and
 * silent on most Android hardware, so every one of them sits on top of a visual.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, space } from '../../theme';

/** Strong ease-out. Reanimated's built-ins are as weak as CSS's. */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * A pressable that scales under the finger.
 *
 * Feedback lands on press-IN — waiting for the tap to complete is the latency
 * people actually notice. `scale` takes the label with it, which is what makes
 * it read as an object rather than a rectangle that changed colour.
 */
export function Press({
  children,
  onPress,
  disabled,
  style,
  haptic = 'light',
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: 'light' | 'none';
}) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Pressable
      onPressIn={() => !disabled && scale.set(withTiming(reduced ? 1 : 0.97, { duration: 120, easing: EASE_OUT }))}
      onPressOut={() => scale.set(withTiming(1, { duration: 120, easing: EASE_OUT }))}
      onPress={() => {
        if (disabled) return;
        if (haptic === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      // A finger drifting a few pixels should not cancel a press the user meant.
      pressRetentionOffset={12}
      hitSlop={6}
      disabled={disabled}
    >
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

export const tapSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
export const tapSelect = () => Haptics.selectionAsync();

/**
 * The pot, as the screen's loudest number.
 *
 * It pulses ONCE when it grows — an entry landed, the prize got bigger, and
 * that is worth a glance. It does not loop: a number that breathes forever is
 * a number you stop reading.
 */
export function Pot({ amount, label = 'Pot' }: { amount: string; label?: string }) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    scale.set(
      withSequence(
        withTiming(1.08, { duration: 140, easing: EASE_OUT }),
        withSpring(1, { duration: 400, dampingRatio: 0.7, reduceMotion: ReduceMotion.System }),
      ),
    );
  }, [amount, reduced, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <View>
      <Text style={styles.potLabel}>{label}</Text>
      <Animated.View style={[styles.potRow, animated]}>
        <Text style={styles.potValue}>{amount}</Text>
        <Text style={styles.potUnit}>SKR</Text>
      </Animated.View>
    </View>
  );
}

/** The theme card: the one place with real colour, so the screen has a subject. */
export function ThemeCard({ theme, children }: { theme: string; children: React.ReactNode }) {
  return (
    <LinearGradient
      colors={['rgba(245,158,11,0.22)', 'rgba(234,88,12,0.10)', 'transparent']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.theme}
    >
      <Text style={styles.themeLabel}>TODAY'S THEME</Text>
      <Text style={styles.themeText}>{theme}</Text>
      <View style={styles.themeRow}>{children}</View>
    </LinearGradient>
  );
}

/**
 * Rank badge. Gold, silver, bronze, then nothing — the paid places are 1–5, and
 * a badge on every card is a badge on none.
 */
export function Rank({ place }: { place: number }) {
  if (place > 5) return null;
  const medal = place === 1 ? colors.flame : place === 2 ? '#cbd5e1' : place === 3 ? '#b45309' : colors.textGhost;
  return (
    <View style={[styles.rank, { borderColor: medal }]}>
      <Text style={[styles.rankText, { color: medal }]}>#{place}</Text>
    </View>
  );
}

/** A live "you're in" chip — steady, not blinking. */
export function Chip({ text, tone = 'flame' }: { text: string; tone?: 'flame' | 'green' }) {
  const color = tone === 'green' ? colors.green : colors.flameSoft;
  return (
    <View style={[styles.chip, { borderColor: `${color}55`, backgroundColor: `${color}1a` }]}>
      <Text style={[styles.chipText, { color }]}>{text}</Text>
    </View>
  );
}

/**
 * Winning is the rare tier, so this is the only thing here that gets a proper
 * entrance: it scales up from 0.95 with a bounce, because you flicked nothing —
 * the app is the one making the noise — and fires a success haptic once.
 */
export function WinBanner({ place, children }: { place: number; children: React.ReactNode }) {
  const scale = useSharedValue(0.95);
  const opacity = useSharedValue(0);
  const shine = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    void tapSuccess();
    opacity.set(withTiming(1, { duration: 220, easing: EASE_OUT }));
    scale.set(
      reduced
        ? withTiming(1, { duration: 220 })
        : withSpring(1, { duration: 500, dampingRatio: 0.55, reduceMotion: ReduceMotion.System }),
    );
    if (!reduced) {
      // Three passes of a highlight, then still. A trophy that shimmers forever
      // is a slot machine.
      shine.set(withRepeat(withTiming(1, { duration: 1400, easing: EASE_OUT }), 3, false));
    }
  }, [opacity, reduced, scale, shine]);

  const card = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ scale: scale.get() }] }));
  const glow = useAnimatedStyle(() => ({ opacity: 0.25 + 0.35 * Math.sin(shine.get() * Math.PI) }));

  return (
    <Animated.View style={[styles.win, card]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.winGlow, glow]} pointerEvents="none" />
      <Text style={styles.winTitle}>{place === 1 ? '🏆  You won the round' : `You placed #${place}`}</Text>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  potLabel: { color: colors.textFaint, fontSize: 11, letterSpacing: 0.5 },
  potRow: { flexDirection: 'row', alignItems: 'baseline', gap: space(1) },
  potValue: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  potUnit: { color: colors.flameSoft, fontSize: 13, fontWeight: '700' },

  theme: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    padding: space(5),
    marginBottom: space(3),
    overflow: 'hidden',
  },
  themeLabel: { color: colors.flameSoft, fontSize: 10, letterSpacing: 1.4, fontWeight: '800' },
  themeText: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: space(2), letterSpacing: -0.4 },
  themeRow: { flexDirection: 'row', gap: space(7), marginTop: space(5), alignItems: 'flex-end' },

  rank: {
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: space(2),
    paddingVertical: 1,
  },
  rankText: { fontSize: 11, fontWeight: '800' },

  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) },
  chipText: { fontSize: 11, fontWeight: '700' },

  win: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
    backgroundColor: 'rgba(245,158,11,0.10)',
    padding: space(4),
    marginBottom: space(3),
    gap: space(2),
    overflow: 'hidden',
  },
  winGlow: { backgroundColor: 'rgba(245,158,11,0.18)' },
  winTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
});
