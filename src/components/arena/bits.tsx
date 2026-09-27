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
import { colors, font, radius, space } from '../../theme';
import { play } from '../../lib/sfx';

/**
 * ARCADE STYLING, in three rules.
 *
 * 1. Pixel type is CHROME ONLY — labels, numbers, buttons, titles. Body copy
 *    stays in the system font; a paragraph of Press Start 2P is unreadable and
 *    that is how pixel styling usually ruins an app.
 * 2. Corners are square-ish (4px) and borders are 2px. Rounded pills read as
 *    iOS; hard edges read as a cabinet.
 * 3. Depth is a hard offset block, never a blur. Shadows do not exist in an
 *    8-bit frame buffer, and Android elevation animates badly anyway.
 */
export const PIXEL = { fontFamily: font.pixel } as const;
export const px = { radius: 4, border: 2, offset: 3 } as const;

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
      <Text style={styles.potLabel}>{label.toUpperCase()}</Text>
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
      <Scanlines />
      <Text style={styles.themeLabel}>TODAY'S THEME</Text>
      <Text style={styles.themeText}>{theme}</Text>
      <View style={styles.themeRow}>{children}</View>
    </LinearGradient>
  );
}

/**
 * CRT scanlines — a stack of 2px-pitch hairlines at 4% white.
 *
 * Drawn as views rather than an image so it costs nothing to ship and scales to
 * any card height. Kept faint: over a photo it would be texture on texture, and
 * this only ever sits on the flat theme card.
 */
function Scanlines() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 40 }).map((_, i) => (
        <View key={i} style={styles.scanline} />
      ))}
    </View>
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
    // The banner IS the moment — it appears when a round you placed in has
    // ended. The arpeggio fires here rather than on the claim tap, because the
    // news is the delight and the claim is just paperwork.
    void tapSuccess();
    play('win');
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
  potLabel: { color: colors.textDim, fontSize: 8, fontFamily: font.pixel, letterSpacing: 1 },
  potRow: { flexDirection: 'row', alignItems: 'baseline', gap: space(2), marginTop: space(2) },
  potValue: { color: colors.text, fontSize: 26, fontFamily: font.pixel },
  potUnit: { color: colors.flameSoft, fontSize: 11, fontFamily: font.pixel },

  theme: {
    borderRadius: px.radius,
    borderWidth: px.border,
    borderColor: 'rgba(245,158,11,0.45)',
    padding: space(5),
    overflow: 'hidden',
  },
  themeLabel: { color: colors.flameSoft, fontSize: 8, letterSpacing: 1.6, fontFamily: font.pixel },
  themeText: { color: colors.text, fontSize: 20, fontFamily: font.pixel, marginTop: space(3), lineHeight: 30 },
  themeRow: { flexDirection: 'row', gap: space(7), marginTop: space(5), alignItems: 'flex-end' },

  rank: {
    borderWidth: px.border,
    borderRadius: px.radius,
    paddingHorizontal: space(2),
    paddingVertical: space(1),
  },
  rankText: { fontSize: 9, fontFamily: font.pixel },

  chip: { borderWidth: px.border, borderRadius: px.radius, paddingHorizontal: space(2.5), paddingVertical: space(1.5) },
  chipText: { fontSize: 8, fontFamily: font.pixel, letterSpacing: 0.5 },

  win: {
    borderRadius: px.radius,
    borderWidth: px.border,
    borderColor: colors.flame,
    backgroundColor: 'rgba(245,158,11,0.10)',
    padding: space(4),
    marginBottom: space(3),
    gap: space(2),
    overflow: 'hidden',
  },
  winGlow: { backgroundColor: 'rgba(245,158,11,0.18)' },
  scanline: { height: 1, marginBottom: 2, backgroundColor: 'rgba(255,255,255,0.035)' },
  winTitle: { color: colors.text, fontSize: 13, fontFamily: font.pixel, lineHeight: 20 },
});
