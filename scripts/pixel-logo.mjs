/**
 * The pixel mark, placed by hand.
 *
 * Downscaling the vector logo produced an artifact, not pixel art: the
 * diagonals broke into unequal steps and the counter filled in. A pixel logo is
 * a drawing on a grid, so this is that drawing — the AG lockup at 30x18, one
 * colour, every pixel chosen. `#` is amber, `.` is empty.
 *
 * Keep the grid rectangular and let the renderer centre it: a mark squeezed
 * into a square grid to match the canvas is how letterforms get uneven stems.
 *
 *   node scripts/pixel-logo.mjs  →  assets/splash-icon-pixel.png
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const GRID = [
  '..............................',
  '..............................',
  '.........##...................',
  '.........##.......########....',
  '........####.....##########...',
  '........####....###......###..',
  '.......##..##...###...........',
  '.......##..##...##............',
  '......##....##..##....#####...',
  '......##....##..##....#####...',
  '.....##......##.##.......###..',
  '.....##########.###......###..',
  '....###......###.##########...',
  '....##........##..########....',
  '...##..........##.............',
  '...##..........##.............',
  '..............................',
  '..............................',
];

const AMBER = '#F59E0B';
const BG = '#0b0b0e';
// The grid is centred on a square canvas at whole-pixel scale — a fractional
// cell size is exactly the blurring this whole file exists to avoid.
const CELL = 32;
const W = GRID[0].length * CELL;
const H = GRID.length * CELL;
const OFF_X = (1024 - W) / 2;
const OFF_Y = (1024 - H) / 2;

const rects = GRID.flatMap((row, y) =>
  [...row].map((c, x) =>
    c === '#'
      ? `<rect x="${OFF_X + x * CELL}" y="${OFF_Y + y * CELL}" width="${CELL}" height="${CELL}" fill="${AMBER}"/>`
      : '',
  ),
).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/>${rects}</svg>`;

writeFileSync('/tmp/pixel-logo.svg', svg);
execFileSync('convert', ['-background', 'none', '/tmp/pixel-logo.svg', 'assets/splash-icon-pixel.png']);
console.log('wrote assets/splash-icon-pixel.png');
