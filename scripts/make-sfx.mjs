/**
 * Generate the arcade blips.
 *
 * SYNTHESISED, not sourced: a judged submission should not carry a sample whose
 * licence I cannot state, and four square-wave blips are a hundred lines of
 * maths rather than a dependency. They are also tiny — a few KB each — which
 * matters in an APK.
 *
 * Square waves at 8-bit-ish frequencies, with a short attack and an exponential
 * decay so nothing clicks. Kept SHORT (60-400ms) and quiet (-14dB peak): a
 * sound you notice twice is a sound people mute for good.
 *
 * Run: node scripts/make-sfx.mjs
 */
import { writeFileSync } from 'node:fs';

const RATE = 22_050; // plenty for square waves, half the bytes of 44.1k
const PEAK = 0.2;

/** One square-wave tone with a 4ms attack and an exponential tail. */
function tone(freq, ms, { start = 0, gain = 1 } = {}) {
  const n = Math.round((ms / 1000) * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.004);
    const decay = Math.exp(-t * (1200 / ms));
    out[i] = (Math.sin(2 * Math.PI * freq * t) >= 0 ? 1 : -1) * attack * decay * gain;
  }
  return { samples: out, start: Math.round((start / 1000) * RATE) };
}

/** Lay tones on one timeline; overlapping notes sum, which is what makes a chord. */
function mix(parts) {
  const len = Math.max(...parts.map((p) => p.start + p.samples.length));
  const buf = new Float32Array(len);
  for (const p of parts) for (let i = 0; i < p.samples.length; i++) buf[p.start + i] += p.samples[i];
  const peak = Math.max(...buf.map(Math.abs), 1e-9);
  const scale = (PEAK / peak) * 32767;
  const pcm = Buffer.alloc(len * 2);
  for (let i = 0; i < len; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf[i] * scale))), i * 2);
  return pcm;
}

/** Minimal 16-bit mono WAV header — expo-audio plays these directly. */
function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// A note name is easier to reason about than 880.0000001.
const N = { C5: 523.25, E5: 659.25, G5: 784, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568, C4: 261.6, G4: 392 };

const SFX = {
  // Travel: one clean blip. It fires on every map tap, so it is the one that
  // has to disappear into the background.
  tap: [tone(N.G5, 60)],
  // Entering costs SKR: a rising third, the sound of something committing.
  enter: [tone(N.C5, 90), tone(N.G5, 120, { start: 70 })],
  // A vote is lighter than an entry — it costs nothing but your one vote.
  vote: [tone(N.E5, 70), tone(N.C6, 90, { start: 55 })],
  // Winning is the only place with a real arpeggio, and the only one allowed
  // to last a third of a second.
  win: [
    tone(N.C5, 110),
    tone(N.E5, 110, { start: 80 }),
    tone(N.G5, 130, { start: 160 }),
    tone(N.C6, 260, { start: 240 }),
    tone(N.E6, 260, { start: 240, gain: 0.6 }),
  ],
  // Failure is two low notes, down. Never a buzzer: the wallet already told
  // them, this is only the echo.
  nope: [tone(N.G4, 90), tone(N.C4, 140, { start: 80 })],
};

for (const [name, parts] of Object.entries(SFX)) {
  const file = `assets/sfx/${name}.wav`;
  writeFileSync(file, wav(mix(parts)));
  console.log(`${file}  ${(wav(mix(parts)).length / 1024).toFixed(1)}KB`);
}
