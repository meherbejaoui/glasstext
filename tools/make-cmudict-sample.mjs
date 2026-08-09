#!/usr/bin/env node
/**
 * Build the committed CMUdict sample used by test/syllables.test.js.
 *
 * The full dictionary is 3.6 MB, too large to vendor for a unit test. This
 * takes a deterministic every-Nth-word sample so CI can enforce the accuracy
 * floor offline, and so the sample is reproducible rather than cherry-picked.
 *
 * Deterministic by construction: no RNG, no shuffling. Re-running on the same
 * dictionary produces a byte-identical file.
 *
 * Usage: node tools/make-cmudict-sample.mjs [size]
 *   Requires tools/.cache/cmudict.dict (run validate-syllables.mjs first).
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = Number(process.argv[2] ?? 4000);

const raw = await readFile(path.join(ROOT, 'tools', '.cache', 'cmudict.dict'), 'utf8');

/** @type {Map<string, Set<number>>} */
const dict = new Map();
for (const line of raw.split('\n')) {
  if (!line || line.startsWith(';;;')) continue;
  const hash = line.indexOf(' #');
  const parts = (hash >= 0 ? line.slice(0, hash) : line).trim().split(/\s+/);
  if (parts.length < 2) continue;

  const word = parts[0].replace(/\(\d+\)$/, '').toLowerCase();
  if (!/^[a-z]+$/.test(word)) continue;

  let n = 0;
  for (let i = 1; i < parts.length; i++) if (/\d/.test(parts[i])) n++;
  if (n === 0) continue;

  if (!dict.has(word)) dict.set(word, new Set());
  dict.get(word).add(n);
}

const all = [...dict.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const step = Math.max(1, Math.floor(all.length / SIZE));
const sample = all
  .filter((_, i) => i % step === 0)
  .map(([word, counts]) => [word, [...counts].sort((a, b) => a - b)]);

await writeFile(
  path.join(ROOT, 'test', 'fixtures', 'cmudict-sample.json'),
  `${JSON.stringify(sample, null, 0)}\n`,
);

console.log(
  `Wrote ${sample.length} words (every ${step}th of ${all.length}) to test/fixtures/cmudict-sample.json`,
);
