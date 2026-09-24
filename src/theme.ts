/**
 * Design tokens — ports agent.glianalabs's dark "ink + amber" aesthetic to a
 * plain, typed StyleSheet system (no NativeWind dependency, guaranteed on RN).
 * Colors mirror the web app's CSS custom properties.
 */
export const colors = {
  ink: '#0a0a0d',
  ink2: '#111114',
  ink3: '#17171c',
  surface: 'rgba(255,255,255,0.04)',
  surfaceStrong: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.08)',
  borderFaint: 'rgba(255,255,255,0.04)',

  flame: '#f59e0b', // amber-500
  flameSoft: '#fbbf24', // amber-400
  flameDeep: '#ea580c', // orange-600

  text: '#ffffff',
  textDim: '#a1a1aa', // zinc-400
  textFaint: '#71717a', // zinc-500
  textGhost: '#52525b', // zinc-600

  green: '#34d399',
  red: '#f87171',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const space = (n: number) => n * 4;

export const font = {
  sans: undefined as string | undefined, // system default
  mono: 'monospace',
  /**
   * The arcade face, used ONLY in the Arena and only for chrome: labels,
   * numbers, buttons, titles. Body copy stays in the system font — Press Start
   * 2P has no lowercase rhythm and a paragraph of it is unreadable, which is
   * how pixel styling usually ruins an app.
   *
   * Falls back to the system font until expo-font has loaded it, so the first
   * frame is never blank.
   */
  pixel: 'PressStart2P_400Regular',
} as const;

/** USD formatter — exact, trims trailing zeros ($0.072 not $0.07). Mirrors web `usd`. */
export const usd = (micro: number) =>
  `$${(micro / 1e6).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`;
