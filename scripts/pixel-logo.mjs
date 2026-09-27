/**
 * The pixel mark: the real logo, point-sampled.
 *
 *   node scripts/pixel-logo.mjs  →  assets/splash-icon-pixel.png
 *
 * Two earlier attempts were wrong in opposite directions. `-resize` to a small
 * size antialiases, so the mark came back as a blurred small logo rather than
 * pixel art. Redrawing the letters by hand read as pixel art but was no longer
 * OUR mark — the brand is a triangular AG monogram, not an "AG" lockup.
 *
 * So: render the vector large, POINT-SAMPLE it down (nearest neighbour, no
 * interpolation, hard pixels), remap to exactly two brand colours so no
 * half-lit pixels survive, and blow it back up by whole pixels. The geometry is
 * the original; only the resolution changed.
 *
 * 28 cells across: wide enough for the G's counter to survive, narrow enough
 * that the diagonals still step visibly.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CELLS = 28;
/**
 * Every place the mark ships:
 *  - splash: full bleed, the mark centred on brand dark
 *  - icon: the launcher/store icon, same treatment (the OS rounds it)
 *  - adaptive foreground: Android masks aggressively, so the mark sits inside
 *    the safe circle — about 60% of the canvas — on a transparent field
 *  - store 512: what the dApp Store listing shows
 */
const OUT = 'assets/splash-icon-pixel.png';
const INK = '#0b0b0e';
const AMBER = '#F59E0B';

// A two-colour palette to remap against: without it the sampled pixels keep the
// mid-tones the vector's antialiasing left behind, and a pixel logo with a
// dozen shades of amber is just a small logo again.
writeFileSync('/tmp/palette.txt', `# ImageMagick pixel enumeration: 2,1,255,srgb\n0,0: (${hex(INK)})\n1,0: (${hex(AMBER)})\n`);

/**
 * The mark, point-sampled to CELLS and blown back up by whole pixels.
 *
 * `transparent` drops the background AFTER rendering, not before: the source
 * SVG paints its own dark square, so asking for a transparent canvas up front
 * produces an empty file — which is exactly what the first adaptive icon was.
 */
function render(size, out, { transparent = false, inset = 0 } = {}) {
  const inner = Math.round(size * (1 - inset));
  execFileSync('convert', [
    '-background', INK,
    'assets/icon-source-fullbleed.svg',
    '-resize', '480x480',
    '-sample', `${CELLS}x${CELLS}`,
    '-remap', '/tmp/palette.txt',
    '-sample', `${inner}x${inner}`,
    ...(transparent ? ['-fuzz', '10%', '-transparent', INK] : []),
    ...(inset ? ['-background', 'none', '-gravity', 'center', '-extent', `${size}x${size}`] : []),
    out,
  ]);
  console.log(`wrote ${out} (${CELLS}x${CELLS} cells)`);
}

render(1024, OUT);
render(1024, 'assets/icon.png');
render(1024, 'assets/adaptive-icon.png', { transparent: true, inset: 0.34 });
render(512, 'dapp-store/media/icon-512.png');
render(48, 'assets/favicon.png');

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
