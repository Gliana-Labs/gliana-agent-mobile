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
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const MUTE_KEY = 'gliana.music.muted';

/**
 * Low on purpose. Loud background music on a phone is the fastest way to a
 * one-star review, and the Arena entries have to be audible OVER this.
 */
const VOLUME = 0.22;

let player: AudioPlayer | null = null;
/**
 * Muted until someone asks for it.
 *
 * Starting a soundtrack the moment an app opens is intrusive — people launch
 * things on a bus, in an office, next to someone sleeping — and it is the kind
 * of thing store reviews punish. The ♪ on the map is the invitation; this is
 * the default it starts from. Also the pre-load value, so nothing plays in the
 * gap before the stored preference arrives.
 */
let muted = true;
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

  // Three steps, three catches. One try block around all of it meant a failure
  // in any step left `player` null and the whole feature dead — which is how a
  // rejected audio-mode call silently turned the soundtrack off.
  try {
    const stored = await AsyncStorage.getItem(MUTE_KEY);
    // No stored preference means a first run: stay muted.
    muted = stored === null ? true : stored === '1';
    announce();
  } catch {
    // Default (unmuted) is fine; the toggle still works for this session.
  }

  try {
    // initSfx sets a global audio mode for the arcade blips with
    // playsInSilentMode false. On this hardware that policy swallows play()
    // outright — loaded, no error, position frozen at zero, exactly as it did
    // to the Arena's music entries.
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
  } catch {
    // Worth trying to play anyway: the mode is a preference, not a gate.
  }

  try {
    // Tear down any previous player first. A Fast Refresh re-runs this module,
    // and without this each reload left the old loop playing underneath the new
    // one — two, then three copies of the same track, slightly out of phase.
    // Harmless in a release build, which never reloads, and maddening in dev.
    if (player) {
      try {
        player.remove();
      } catch {
        /* already gone */
      }
      player = null;
    }
    player = createAudioPlayer(require('../../assets/music/map-theme.wav'));
    player.loop = true;
    player.volume = VOLUME;
    // play() before the asset has loaded is a silent no-op in expo-audio — the
    // same trap that made the Arena's music entries silent. Driving it from the
    // status means it starts whenever it becomes both loaded and wanted.
    player.addListener('playbackStatusUpdate', (status) => {
      if (!player || !status.isLoaded) return;
      if (wanted && !muted && !status.playing) player.play();
    });
    if (wanted && !muted) player.play();
  } catch {
    // No audio on this device. Silence is a fine outcome.
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
