#!/usr/bin/env node
// Build src/lib/showcase.json — the /showcase gallery of generated samples
// (media + the model that made it + the prompt). Two sources, merged:
//   SEED   — auto-flattened from the gateway repo's example data
//            (../../gliana-ai/data/*-models.json → result.examples[]).
//   CURATED— our own picks in src/lib/showcase-curated.json (featured first;
//            this is where brand / brainrot content lives).
// Hand-run before `npm run build`:  node scripts/build-showcase.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, '../src/lib');
const DATA = resolve(here, '../../gliana-ai/data');

// One data file = one category. Speech-to-Text is omitted (output is text).
const FILE_CAT = {
  texttoimage: 'image',
  texttovideo: 'video',
  imagetovideo: 'video',
  videotovideo: 'video',
  texttospeech: 'voice',
  musicgeneration: 'music',
};

const seed = [];
for (const [file, category] of Object.entries(FILE_CAT)) {
  const p = resolve(DATA, `${file}-models.json`);
  if (!existsSync(p)) continue;
  for (const { result: r } of JSON.parse(readFileSync(p, 'utf8'))) {
    if (!r?.model_id) continue;
    const id = r.model_id.split('/').pop();
    const provider = r.model_id.split('/')[0];
    for (const ex of r.examples || []) {
      const out = ex.output || {};
      const url = out.video || out.image || out.audio;
      if (!url) continue;
      // NB: some examples live on pub-<hash>.r2.dev (a rate-limited R2 dev URL) so
      // a few may intermittently fail to load — the page hides any that error
      // (Card onError), rather than pruning here on a flaky build-time check.
      const type = out.video ? 'video' : out.image ? 'image' : 'audio';
      const prompt = String(ex.input?.prompt ?? ex.input?.text ?? ex.name ?? '');
      seed.push({ id, runId: r.model_id, model: r.name, provider, category, type, url, prompt, source: 'seed' });
    }
  }
}

const curatedPath = resolve(LIB, 'showcase-curated.json');
const curated = existsSync(curatedPath) ? JSON.parse(readFileSync(curatedPath, 'utf8')) : [];
const cur = curated.map((c) => ({ source: 'curated', ...c }));

const items = [...cur.filter((c) => c.featured), ...cur.filter((c) => !c.featured), ...seed];

writeFileSync(
  resolve(LIB, 'showcase.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 0) + '\n',
);
const byCat = items.reduce((a, i) => ((a[i.category] = (a[i.category] || 0) + 1), a), {});
console.log(`showcase: ${items.length} items (${cur.length} curated + ${seed.length} seed) ${JSON.stringify(byCat)}`);
