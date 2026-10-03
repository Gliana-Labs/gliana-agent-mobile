/**
 * The map's background loop.
 *
 * WAV, not mp3 and not Ogg. MP3 carries encoder delay and padding, so a looped
 * mp3 inserts a few milliseconds of silence on every pass — audible as a tick
 * on a quiet pad, and no amount of crossfading the source fixes it. Opus in Ogg
 * is gapless but expo-audio could not open it at all ("Source error"), even
 * with .ogg added to Metro's assetExts. PCM has no encoder delay by
 * construction; mono at 32kHz keeps an ambient pad near a megabyte.
 *
 * Deliberately separate from the arcade blips in sfx.ts: someone can want the
 * clicks without a soundtrack, or the other way round, and one toggle for both
 * makes that impossible. Quiet by default — this sits under a menu, it is not
 * the thing anyone opened the app for.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

const MUTE_KEY = 'gliana.music.muted';

/**
 * Low on purpose. Loud background music on a phone is the fastest way to a
 * one-star review, and the Arena entries have to be audible OVER this.
 */
const VOLUME = 0.22;

let player: AudioPlayer | null = null;
let muted = false;
let wanted = false;
let ready = false;

/**
 * Listeners for the mute state.
 *
 * The preference loads from storage asynchronously, so a toggle that read the
 * value once at mount rendered "on" while the module was still muted — and
 * every tap then set it back to muted, which looked exactly like a dead button.
 */
const listeners = new Set<(muted: boolean) => void>();
const announce = () => listeners.forEach((l) => l(muted));

export function onMusicMuteChange(fn: (muted: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Load the preference. Safe to call more than once. */
export async function initMusic(): Promise<void> {
  if (ready) return;
  ready = true;
  try {
    muted = (await AsyncStorage.getItem(MUTE_KEY)) === '1';
    announce();
    player = createAudioPlayer(require('../../assets/music/map-theme.wav'));
    player.loop = true;
    player.volume = VOLUME;
    if (wanted && !muted) player.play();
  } catch {
    // No audio on this device, or storage refused. Silence is a fine outcome.
    player = null;
  }
}

export function isMusicMuted(): boolean {
  return muted;
}

export async function setMusicMuted(next: boolean): Promise<void> {
  muted = next;
  announce();
  try {
    await AsyncStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    // The toggle still works for this session.
  }
  if (!player) return;
  if (next) player.pause();
  else if (wanted) player.play();
}

/**
 * Whether the map wants the loop running. Called on every view change rather
 * than start/stop, so the caller never has to track what is already playing.
 */
export function setMusicActive(active: boolean): void {
  wanted = active;
  if (!player) return;
  if (active && !muted) player.play();
  else player.pause();
}
