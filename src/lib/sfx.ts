/**
 * The arcade blips.
 *
 * Five short square-wave sounds, synthesised by scripts/make-sfx.mjs rather
 * than sampled — a judged submission should not ship audio whose licence I
 * cannot state.
 *
 * Three rules keep sound from becoming the thing people mute:
 *
 * 1. It never plays alone. Every blip sits on top of a visual and a haptic that
 *    already said the same thing, so silencing it loses nothing.
 * 2. It never interrupts. `interruptionMode: 'mixWithOthers'` means someone's
 *    music keeps playing, and `playsInSilentMode: false` means a phone on
 *    silent stays silent — a game that shouts over a podcast gets uninstalled.
 * 3. Players are created ONCE and rewound, not created per press. Building an
 *    AudioPlayer on a tap costs a frame, and the sound then lands after the
 *    thing it is meant to punctuate.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Sfx = 'tap' | 'enter' | 'vote' | 'win' | 'nope';

const SOURCES: Record<Sfx, number> = {
  tap: require('../../assets/sfx/tap.wav'),
  enter: require('../../assets/sfx/enter.wav'),
  vote: require('../../assets/sfx/vote.wav'),
  win: require('../../assets/sfx/win.wav'),
  nope: require('../../assets/sfx/nope.wav'),
};

const MUTE_KEY = 'gliana-agent:sfx-muted:v1';

let players: Partial<Record<Sfx, AudioPlayer>> = {};
let muted = false;
let ready = false;

/** Load the preference and warm the players. Safe to call more than once. */
export async function initSfx(): Promise<void> {
  if (ready) return;
  ready = true;
  try {
    muted = (await AsyncStorage.getItem(MUTE_KEY)) === '1';
    await setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
    });
    for (const [name, src] of Object.entries(SOURCES)) {
      players[name as Sfx] = createAudioPlayer(src);
    }
  } catch {
    // No audio on this device, or storage refused. The app is fully playable
    // without sound, so a failure here is silence, not an error.
    players = {};
  }
}

export function isMuted(): boolean {
  return muted;
}

export async function setMuted(next: boolean): Promise<void> {
  muted = next;
  try {
    await AsyncStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    /* preference is a nicety; the session still honours it */
  }
}

/**
 * Play one blip. Fire-and-forget by design: a sound that throws must never take
 * down the action it was decorating.
 */
export function play(name: Sfx): void {
  if (muted) return;
  const p = players[name];
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {
    /* a player mid-release, or audio focus lost */
  }
}
